import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Unique per build; the native app compares it with the server's /version.json.
const APP_VERSION = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  build: { target: 'es2022' },
  plugins: [
    react(),
    {
      name: 'app-version',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION }) });
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // registered in main.tsx, web only
      manifest: {
        name: 'Open Things',
        short_name: 'Things',
        description: 'Local-first to-do manager with self-hosted sync',
        theme_color: '#3b82f6',
        background_color: '#f7f7f8',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: { navigateFallbackDenylist: [/^\/api\//] },
    }),
  ],
  server: {
    proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true } },
  },
});
