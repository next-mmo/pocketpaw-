#!/usr/bin/env node
/**
 * PocketPaw Desktop — Build Script
 *
 * Prepares the backend bundle for packaging with electron-builder:
 *   1. Builds a Python wheel from the pocketpaw source (../pyproject.toml)
 *   2. Downloads the uv binary for the current platform
 *   3. Copies both into resources/backend/ for bundling
 *
 * Run: node scripts/build-backend.js
 */

import { execSync } from 'child_process'
import { existsSync, mkdirSync, copyFileSync, readdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { platform, arch } from 'os'

const ROOT = resolve(join(import.meta.dirname, '..'))
const PROJECT_ROOT = resolve(join(ROOT, '..'))
const RESOURCES_DIR = join(ROOT, 'resources')
const BACKEND_DIR = join(RESOURCES_DIR, 'backend')

function log(msg) {
  console.log(`  🔧 ${msg}`)
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

// ─── Step 1: Build the pocketpaw wheel ────────────────────────────

function buildWheel() {
  log('Building pocketpaw wheel...')
  const distDir = join(PROJECT_ROOT, 'dist')

  try {
    // Use uv build to create the wheel (fastest)
    execSync('uv build --wheel', {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      timeout: 120000
    })
  } catch {
    // Fallback to pip build
    log('uv build failed, trying pip...')
    execSync('python -m build --wheel', {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      timeout: 120000
    })
  }

  // Find the built wheel
  const wheels = readdirSync(distDir).filter(f => f.endsWith('.whl'))
  if (wheels.length === 0) {
    throw new Error('No wheel found in dist/ after build')
  }

  // Copy the latest wheel
  const wheel = wheels.sort().pop()
  const src = join(distDir, wheel)
  const dst = join(BACKEND_DIR, wheel)
  ensureDir(BACKEND_DIR)
  copyFileSync(src, dst)
  log(`Wheel: ${wheel}`)

  return wheel
}

// ─── Step 2: Download uv binary ───────────────────────────────────

function downloadUv() {
  const os = platform()
  const cpu = arch()

  // Map to uv target names
  const targetMap = {
    'win32-x64': 'x86_64-pc-windows-msvc.zip',
    'win32-arm64': 'aarch64-pc-windows-msvc.zip',
    'darwin-x64': 'x86_64-apple-darwin.tar.gz',
    'darwin-arm64': 'aarch64-apple-darwin.tar.gz',
    'linux-x64': 'x86_64-unknown-linux-musl.tar.gz',
    'linux-arm64': 'aarch64-unknown-linux-musl.tar.gz'
  }

  const target = targetMap[`${os}-${cpu}`]
  if (!target) {
    log(`⚠️  No uv binary for ${os}-${cpu}, skipping (will use system uv)`)
    return
  }

  const uvDir = join(BACKEND_DIR, 'uv')
  ensureDir(uvDir)

  const isWin = os === 'win32'
  const uvBin = join(uvDir, isWin ? 'uv.exe' : 'uv')

  if (existsSync(uvBin)) {
    log('uv binary already exists, skipping download')
    return
  }

  // Use the pinned version from bootstrap.py
  const version = '0.6.6'
  const url = `https://github.com/astral-sh/uv/releases/download/${version}/uv-${target}`

  log(`Downloading uv ${version} for ${os}-${cpu}...`)

  try {
    if (target.endsWith('.zip')) {
      // Download and extract zip (Windows)
      const tmpZip = join(BACKEND_DIR, 'uv-tmp.zip')
      execSync(`curl -fsSL "${url}" -o "${tmpZip}"`, { timeout: 60000, stdio: 'pipe' })

      // Extract uv.exe from the zip
      execSync(`tar -xf "${tmpZip}" -C "${uvDir}" --strip-components=1`, {
        timeout: 30000, stdio: 'pipe'
      })

      // Clean up
      try { require('fs').unlinkSync(tmpZip) } catch {}
    } else {
      // tar.gz (macOS/Linux)
      execSync(
        `curl -fsSL "${url}" | tar xz -C "${uvDir}" --strip-components=1`,
        { timeout: 60000, stdio: 'pipe', shell: true }
      )
    }

    if (existsSync(uvBin)) {
      log(`uv binary: ${uvBin}`)
    } else {
      log('⚠️  uv download completed but binary not found')
    }
  } catch (err) {
    log(`⚠️  Failed to download uv: ${err.message}`)
  }
}

// ─── Step 3: Write bootstrap metadata ─────────────────────────────

function writeMetadata(wheelName) {
  const meta = {
    version: JSON.parse(
      require('fs').readFileSync(join(ROOT, 'package.json'), 'utf-8')
    ).version,
    wheel: wheelName,
    builtAt: new Date().toISOString(),
    platform: `${platform()}-${arch()}`
  }

  writeFileSync(
    join(BACKEND_DIR, 'bundle.json'),
    JSON.stringify(meta, null, 2)
  )
  log(`Metadata written to bundle.json`)
}

// ─── Main ─────────────────────────────────────────────────────────

try {
  log('Preparing backend bundle...')
  ensureDir(BACKEND_DIR)

  const wheel = buildWheel()
  downloadUv()
  writeMetadata(wheel)

  log('✅ Backend bundle ready in resources/backend/')
} catch (err) {
  console.error(`\n  ❌ Build failed: ${err.message}\n`)
  process.exit(1)
}
