import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve('shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts')
        }
      }
    }
    // NB : les fichiers .sql de migrations sont importés via "?raw" dans
    // migrate.ts : Vite les inline directement dans le bundle JS.
    // Aucune copie de fichiers à gérer → robuste en dev ET en production.
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('shared')
      }
    },
    plugins: [react()]
  }
})
