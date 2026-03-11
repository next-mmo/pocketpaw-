#!/usr/bin/env node
/**
 * PocketPaw Desktop — Bytecode Compiler
 *
 * Compiles the built JavaScript files to V8 bytecode using bytenode.
 * Must be run via Electron's Node.js (not system Node) for V8 compatibility.
 *
 * Usage:
 *   npx electron scripts/compile-bytecode.js
 *   -- OR --
 *   node scripts/compile-bytecode.js  (uses system Node V8 — for CI or testing)
 *
 * Output: .jsc files alongside .js files, with .js files replaced by loaders.
 */

const bytenode = require('bytenode')
const { readFileSync, writeFileSync, existsSync } = require('fs')
const { join, resolve, basename } = require('path')
const { createHash } = require('crypto')

const ROOT = resolve(join(__dirname, '..'))
const OUT_DIR = join(ROOT, 'out')

// Files to compile to bytecode
const TARGETS = [
  join(OUT_DIR, 'main', 'index.js'),
  join(OUT_DIR, 'preload', 'index.js')
]

function log(msg) {
  console.log(`  🔒 ${msg}`)
}

async function compileToBytecode() {
  log('Compiling to V8 bytecode...')
  const hashes = {}

  for (const jsFile of TARGETS) {
    if (!existsSync(jsFile)) {
      log(`⚠️  Skipping ${basename(jsFile)} (not found)`)
      continue
    }

    const jscFile = jsFile.replace('.js', '.jsc')
    const name = jsFile.replace(ROOT + '\\', '').replace(ROOT + '/', '')

    try {
      // Compile to bytecode
      await bytenode.compileFile({
        filename: jsFile,
        output: jscFile,
        electron: true
      })

      // Generate hash of the compiled bytecode
      const content = readFileSync(jscFile)
      const hash = createHash('sha256').update(content).digest('hex')
      hashes[name] = hash

      // Replace the .js file with a tiny loader that runs the bytecode
      const relativePath = './' + basename(jscFile)
      const loader = `'use strict';require('bytenode');require('${relativePath}');`
      writeFileSync(jsFile, loader)

      const sizeKB = (content.length / 1024).toFixed(1)
      log(`✅ ${name} → .jsc (${sizeKB} KB)`)
    } catch (err) {
      log(`⚠️  Bytecode skipped for ${name}: ${err.message}`)
      // Non-fatal — JS files still work without bytecode
    }
  }

  // Write integrity hashes
  const hashFile = join(OUT_DIR, 'integrity.json')
  writeFileSync(hashFile, JSON.stringify(hashes, null, 2))
  log(`Integrity hashes → out/integrity.json`)
}

compileToBytecode()
  .then(() => log('Done!'))
  .catch(err => {
    console.error(`\n  ❌ Compilation failed: ${err.message}\n`)
    // Don't exit(1) — bytecode is an optional hardening layer
  })
