import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Identificador de esta versión del sitio. Queda dentro de la aplicación y
// también en /version.json: comparando los dos, una pestaña que lleva tiempo
// abierta sabe que se publicó una versión más nueva (ver UpdateNotice.jsx).
const appVersion = Date.now().toString(36)

function versionFile() {
  return {
    name: 'fribuk-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: appVersion }),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), versionFile()],
  define: {
    // En desarrollo no hay versión publicada con la cual comparar.
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(
      command === 'build' ? appVersion : ''
    ),
  },
  // Pruebas (npm test): Vitest con un navegador simulado.
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
  },
}))
