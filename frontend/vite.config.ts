import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Custom service worker with Web Push handlers (feature 003, research R2).
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
      // Service worker (and push) also in `npm run dev`.
      devOptions: { enabled: true, type: 'module', navigateFallback: 'index.html' },
      includeAssets: ['icons/favicon.svg', 'icons/favicon.ico', 'icons/apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Car Checkup',
        short_name: 'Car Checkup',
        description: 'Lleva el kilometraje y el mantenimiento de tus vehículos sin complicaciones.',
        lang: 'es',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#1f3a5f',
        background_color: '#f6f7f9',
        icons: [
          { src: '/icons/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
});
