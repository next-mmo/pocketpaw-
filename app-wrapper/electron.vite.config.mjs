import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'

const isProd = process.env.NODE_ENV === 'production'

export default defineConfig({
  // ─── Main Process ───
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.js')
        }
      },
      // Minify main process code in production
      minify: isProd ? 'terser' : false,
      ...(isProd && {
        terserOptions: {
          compress: {
            drop_console: true,
            drop_debugger: true
          },
          mangle: {
            toplevel: true,
            properties: { regex: /^_/ }
          }
        }
      })
    }
  },

  // ─── Preload Scripts ───
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.js')
        }
      },
      minify: isProd ? 'terser' : false,
      ...(isProd && {
        terserOptions: {
          compress: { drop_console: true }
        }
      })
    }
  },

  // ─── Renderer Process ───
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      },
      // No sourcemaps in production
      sourcemap: isProd ? false : true,
      minify: isProd ? 'terser' : false,
      ...(isProd && {
        terserOptions: {
          compress: {
            drop_console: true,
            drop_debugger: true,
            passes: 2
          },
          mangle: { toplevel: true }
        }
      })
    }
  }
})
