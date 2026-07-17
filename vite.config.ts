import { defineConfig } from 'vite';

// allowedHosts lets the dev server answer through a Cloudflare quick tunnel
// (phone playtests). Dev-only; `vite build` output is unaffected.
export default defineConfig({
  server: {
    port: 3200,
    allowedHosts: true,
  },
});
