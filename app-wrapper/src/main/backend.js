/**
 * PocketPaw Desktop — Backend Server Manager
 *
 * Spawns the Nuitka-compiled PocketPaw binary from resources/backend/.
 *
 * Production flow:
 *   1. Find the compiled binary at resources/backend/pocketpaw-server[.exe]
 *   2. Spawn it with --port flag
 *   3. Health-check until dashboard responds
 *   4. Graceful shutdown on app quit
 *
 * Dev flow:
 *   Assumes backend is running externally (e.g., sh dev.sh).
 *
 * Fallback: If no compiled binary exists, falls back to venv Python
 * (for users who installed via the pip/uv installer).
 */

import { spawn } from 'child_process'
import {
  existsSync, readFileSync, writeFileSync, unlinkSync, appendFileSync, mkdirSync
} from 'fs'
import { join } from 'path'
import { homedir, platform } from 'os'
import { app } from 'electron'

const POCKETPAW_HOME = join(homedir(), '.pocketpaw')
const VENV_DIR = join(POCKETPAW_HOME, 'venv')
const PID_FILE = join(POCKETPAW_HOME, 'launcher.pid')
const LOG_FILE = join(POCKETPAW_HOME, 'server.log')
const DEFAULT_PORT = 8888
const BINARY_NAME = platform() === 'win32' ? 'pocketpaw-server.exe' : 'pocketpaw-server'

let serverProcess = null
let currentPort = DEFAULT_PORT

// ─── Paths ──────────────────────────────────────────────────────

/**
 * Get the resources directory.
 * Production: alongside app.asar (extraResources destination)
 * Dev: project root /resources
 */
function getResourcesDir() {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'resources')
  }
  return join(__dirname, '../../resources')
}

/**
 * Path to the Nuitka-compiled backend binary.
 */
function getBinaryPath() {
  // Standalone mode: binary inside a .dist folder
  const distDir = join(getResourcesDir(), 'backend', 'pocketpaw-server.dist')
  const distBin = join(distDir, BINARY_NAME)
  if (existsSync(distBin)) return distBin

  // Onefile mode: single binary
  const onefile = join(getResourcesDir(), 'backend', BINARY_NAME)
  if (existsSync(onefile)) return onefile

  return null
}

/**
 * Fallback: venv Python path (for pip/uv installs)
 */
function venvPython() {
  if (platform() === 'win32') {
    return join(VENV_DIR, 'Scripts', 'python.exe')
  }
  return join(VENV_DIR, 'bin', 'python')
}

function readPortFromConfig() {
  const configPath = join(POCKETPAW_HOME, 'config.json')
  try {
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
      if (config.web_port) return config.web_port
    }
  } catch { /* ignore */ }
  return DEFAULT_PORT
}

// ─── Process Helpers ────────────────────────────────────────────

function isPidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function isAlreadyRunning() {
  if (serverProcess && !serverProcess.killed) return true
  try {
    if (existsSync(PID_FILE)) {
      const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10)
      if (pid && isPidAlive(pid)) return true
      unlinkSync(PID_FILE)
    }
  } catch { /* ignore */ }
  return false
}

async function isHealthy(port) {
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(3000)
    })
    return resp.ok || resp.status === 401
  } catch {
    return false
  }
}

async function waitForHealthy(port, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (serverProcess && serverProcess.exitCode !== null) return false
    if (await isHealthy(port)) return true
    await new Promise(r => setTimeout(r, 1000))
  }
  return false
}

function buildEnv() {
  const env = { ...process.env }
  env.PYTHONIOENCODING = 'utf-8'
  env.PYTHONUTF8 = '1'
  return env
}

// ─── Start / Stop ───────────────────────────────────────────────

/**
 * Start the PocketPaw backend server.
 *
 * Strategy (in order):
 *   1. Compiled Nuitka binary (resources/backend/pocketpaw-server[.exe])
 *   2. Venv Python (installed via pip/uv installer at ~/.pocketpaw/venv)
 *   3. System `pocketpaw` command (global pip install)
 */
export async function startBackend(onStatus = () => {}) {
  currentPort = readPortFromConfig()
  mkdirSync(POCKETPAW_HOME, { recursive: true })

  // Already running?
  if (isAlreadyRunning()) {
    if (await isHealthy(currentPort)) {
      onStatus('Server is already running')
      return { ok: true, port: currentPort, message: 'Already running' }
    }
  }

  // Find the right way to launch
  let cmd, args
  const binaryPath = getBinaryPath()
  const python = venvPython()

  if (binaryPath) {
    // ── Strategy 1: Compiled binary ──
    cmd = binaryPath
    args = ['--port', String(currentPort)]
    onStatus('Starting PocketPaw…')
  } else if (existsSync(python)) {
    // ── Strategy 2: Venv Python (installer users) ──
    cmd = python
    args = ['-m', 'pocketpaw', '--port', String(currentPort)]
    onStatus('Starting via Python environment…')
  } else {
    // ── Strategy 3: System command ──
    cmd = 'pocketpaw'
    args = ['--port', String(currentPort)]
    onStatus('Starting via system pocketpaw…')
  }

  onStatus(`Starting PocketPaw on port ${currentPort}…`)

  try {
    const env = buildEnv()
    const isWin = platform() === 'win32'

    serverProcess = spawn(cmd, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: !isWin,
      windowsHide: true
    })

    // Log output to file
    const logLine = (data) => {
      try { appendFileSync(LOG_FILE, data.toString()) } catch { /* ignore */ }
    }
    serverProcess.stdout?.on('data', logLine)
    serverProcess.stderr?.on('data', logLine)

    // Write PID file
    writeFileSync(PID_FILE, String(serverProcess.pid))

    serverProcess.on('exit', (code) => {
      onStatus(`Server exited with code ${code}`)
      try { unlinkSync(PID_FILE) } catch { /* ignore */ }
      serverProcess = null
    })

    // Wait for healthy
    onStatus('Waiting for server to start…')
    const healthy = await waitForHealthy(currentPort)

    if (healthy) {
      onStatus(`PocketPaw running on port ${currentPort}`)
      return { ok: true, port: currentPort, message: 'Server started' }
    } else {
      onStatus('Server started but health check timed out')
      return { ok: true, port: currentPort, message: 'Started (health check pending)' }
    }
  } catch (err) {
    onStatus(`Failed to start: ${err.message}`)
    return { ok: false, port: currentPort, message: err.message }
  }
}

/**
 * Stop the backend server gracefully.
 */
export async function stopBackend() {
  if (serverProcess && serverProcess.exitCode === null) {
    const isWin = platform() === 'win32'
    try {
      if (isWin) {
        spawn('taskkill', ['/F', '/T', '/PID', String(serverProcess.pid)], {
          stdio: 'ignore', windowsHide: true
        })
      } else {
        process.kill(-serverProcess.pid, 'SIGTERM')
      }
      await new Promise(r => setTimeout(r, 3000))
      if (serverProcess && serverProcess.exitCode === null) {
        serverProcess.kill('SIGKILL')
      }
    } catch { /* ignore */ }
    serverProcess = null
  }

  // Clean up PID file
  try {
    if (existsSync(PID_FILE)) {
      const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10)
      if (pid && isPidAlive(pid)) {
        process.kill(pid, 'SIGTERM')
      }
      unlinkSync(PID_FILE)
    }
  } catch { /* ignore */ }
}

export function getDashboardUrl() {
  return `http://127.0.0.1:${currentPort}`
}

export function shouldManageBackend() {
  return !process.env.ELECTRON_DEV && !process.env.VITE_DEV_SERVER_URL
}

export function isBackendRunning() {
  return isAlreadyRunning()
}
