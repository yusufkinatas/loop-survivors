import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    // Allow any host so tunnel URLs (e.g. *.trycloudflare.com) can reach the dev server.
    allowedHosts: true,
  },
})
