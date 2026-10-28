import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Keep the existing manifest URL and let open tabs finish before updating.
      manifest: false,
      injectRegister: 'script',
      registerType: 'prompt',
      includeAssets: ['manifest.webmanifest', 'brand/icon-192.png', 'brand/icon-512.png', 'brand/apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: false,
        // Shared data always uses the API; only the static app is cached.
        runtimeCaching: [],
      },
    }),
  ],
  base: './',
});
