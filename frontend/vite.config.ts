/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The dev server proxies the API and packaged media to the .NET backend,
// so the browser sees a single origin and no CORS setup is needed while developing.
// HAKUTV_API overrides the target, e.g. to run a second API on another port: $env:HAKUTV_API='http://localhost:5081'
const apiTarget = process.env.HAKUTV_API ?? 'http://localhost:5080'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The lazy WatchPage chunk is ~1.2 MB because it holds Shaka Player + UI; only the player route downloads it.
  build: { chunkSizeWarningLimit: 1300 },
  // Unit and component tests (npm test). jsdom gives the components a DOM; setup.ts cleans it between tests.
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': apiTarget,
      '/media': apiTarget,
    },
  },
})
