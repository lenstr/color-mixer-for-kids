import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base so the built game also works from any static folder
// (GitHub Pages serves it under /color-mixer-for-kids/).
export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'prompt', // src/update.ts asks before switching versions
      injectRegister: false,
      includeManifestIcons: false, // already matched by globPatterns
      manifest: {
        id: './',
        name: 'Клякса — мастерская цвета',
        short_name: 'Клякса',
        description: 'Весёлая игра для детей про смешивание красок',
        lang: 'ru',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#FFF4E2',
        theme_color: '#FFF4E2',
        categories: ['education', 'games', 'kids'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        screenshots: [
          {
            src: 'screenshots/wide.webp',
            sizes: '1280x800',
            type: 'image/webp',
            form_factor: 'wide',
            label: 'Мастерская: смешиваем красную, синюю и белую краски',
          },
          {
            src: 'screenshots/narrow.webp',
            sizes: '780x1688',
            type: 'image/webp',
            form_factor: 'narrow',
            label: 'Задание с подсказкой на телефоне',
          },
        ],
      },
      workbox: {
        // Everything the game needs, voice clips included, so it plays offline.
        // Fonts ship as woff2 and woff; every target browser uses woff2.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,mp3}'],
        globIgnores: ['screenshots/**'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
