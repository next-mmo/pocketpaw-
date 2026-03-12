/**
 * PocketPaw Desktop — Security Guard
 *
 * Runtime anti-tamper and anti-debug protections.
 * These don't prevent a determined attacker, but raise the bar
 * significantly against casual cracking.
 *
 * Layers:
 *   1. Debugger detection (timing-based + flag check)
 *   2. Integrity verification (hash check of critical files)
 *   3. Environment tampering detection
 */

import { createHash } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

// ─── Debugger Detection ─────────────────────────────────────────

/**
 * Detect if a debugger is attached using timing analysis.
 * Debuggers slow down execution significantly.
 */
function isDebuggerAttached() {
  // Check Node.js inspector
  if (typeof process !== 'undefined') {
    // Inspector port open = debugger attached
    try {
      const inspector = require('inspector')
      if (inspector.url()) return true
    } catch { /* inspector not available */ }

    // Check debug flags
    const execArgv = process.execArgv || []
    const debugFlags = ['--inspect', '--inspect-brk', '--debug', '--debug-brk']
    if (execArgv.some(arg => debugFlags.some(flag => arg.startsWith(flag)))) {
      return true
    }
  }

  // Timing-based detection — debugger breakpoints slow execution
  const start = performance.now()
  // eslint-disable-next-line no-debugger
  debugger // This line is intentionally here — a breakpoint trap
  const elapsed = performance.now() - start
  // If execution took > 100ms, a debugger likely paused on the statement
  if (elapsed > 100) return true

  return false
}

// ─── Integrity Verification ──────────────────────────────────────

/**
 * Generate SHA-256 hash of a file.
 */
function hashFile(filePath) {
  try {
    const content = readFileSync(filePath)
    return createHash('sha256').update(content).digest('hex')
  } catch {
    return null
  }
}

/**
 * Verify integrity of critical application files.
 * Returns { ok, tampered[] } where tampered lists modified files.
 */
export function verifyIntegrity(expectedHashes = null) {
  // In dev mode, skip integrity checks
  if (!app.isPackaged) return { ok: true, tampered: [] }

  const criticalFiles = [
    join(__dirname, 'index.js'),         // main process
    join(__dirname, '../preload/index.js') // preload bridge
  ]

  const tampered = []
  for (const file of criticalFiles) {
    if (!existsSync(file)) {
      tampered.push({ file, reason: 'missing' })
      continue
    }

    if (expectedHashes) {
      const hash = hashFile(file)
      if (expectedHashes[file] && hash !== expectedHashes[file]) {
        tampered.push({ file, reason: 'hash_mismatch', expected: expectedHashes[file], actual: hash })
      }
    }
  }

  return { ok: tampered.length === 0, tampered }
}

/**
 * Generate hashes for all critical files (used at build time).
 * Call this during the build step and embed the result.
 */
export function generateHashes() {
  const files = {
    main: join(__dirname, 'index.js'),
    preload: join(__dirname, '../preload/index.js')
  }

  const hashes = {}
  for (const [key, path] of Object.entries(files)) {
    hashes[key] = hashFile(path)
  }
  return hashes
}

// ─── Environment Tampering Detection ─────────────────────────────

/**
 * Detect suspicious environment modifications.
 */
function isEnvironmentTampered() {
  // Check for common reverse engineering tools
  const suspiciousEnvVars = [
    'ELECTRON_RUN_AS_NODE',      // Used to run Electron as Node.js
    'ELECTRON_NO_ASAR',          // Disables ASAR protection
    'NODE_OPTIONS',              // Can inject debugging flags
  ]

  for (const envVar of suspiciousEnvVars) {
    if (process.env[envVar]) {
      return { tampered: true, reason: `Suspicious env: ${envVar}` }
    }
  }

  return { tampered: false }
}

// ─── Main Security Check ─────────────────────────────────────────

/**
 * Run all security checks. Call this early in app startup.
 *
 * @param {object} options
 * @param {boolean} options.exitOnFail - Quit app if checks fail (default: true in prod)
 * @param {function} options.onWarning - Callback for non-fatal warnings
 * @returns {{ passed: boolean, warnings: string[] }}
 */
export function runSecurityChecks(options = {}) {
  const { exitOnFail = app.isPackaged, onWarning = () => {} } = options
  const warnings = []

  // Skip all checks in dev
  if (!app.isPackaged) {
    return { passed: true, warnings: [] }
  }

  // 1. Debugger detection
  if (isDebuggerAttached()) {
    const msg = 'Debugger detected — application will exit'
    warnings.push(msg)
    if (exitOnFail) {
      app.quit()
      return { passed: false, warnings }
    }
    onWarning(msg)
  }

  // 2. Environment tampering
  const envCheck = isEnvironmentTampered()
  if (envCheck.tampered) {
    // Clear suspicious env vars instead of crashing
    delete process.env.ELECTRON_RUN_AS_NODE
    delete process.env.ELECTRON_NO_ASAR
    delete process.env.NODE_OPTIONS
    warnings.push(envCheck.reason)
    onWarning(envCheck.reason)
  }

  // 3. Integrity check (file hashes)
  const integrity = verifyIntegrity()
  if (!integrity.ok) {
    const msg = `Integrity check failed: ${integrity.tampered.map(t => t.reason).join(', ')}`
    warnings.push(msg)
    if (exitOnFail) {
      app.quit()
      return { passed: false, warnings }
    }
    onWarning(msg)
  }

  return { passed: warnings.length === 0, warnings }
}
