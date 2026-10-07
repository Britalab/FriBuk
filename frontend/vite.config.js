import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Pruebas (npm test): Vitest con un navegador simulado.
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
  },
})
