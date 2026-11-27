import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const SPA_ROUTES = [
  '/home.html',
  '/dashboard.html',
  '/admin-employees.html',
  '/admin-import.html',
  '/admin-manual-entry.html',
  '/reports.html',
  '/audit-logs.html',
  '/themes.html',
  '/employees-current.html',
  '/employees-left.html',
  '/employees-new.html',
  '/employee.html',
  '/missing-data.html',
  '/requests.html',
  '/settings.html',
  '/index.html',
];

function legacyHtmlRoutes() {
  return {
    name: 'iems-legacy-html-routes',
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) {
      server.middlewares.use((req, _res, next) => {
        const cleanPath = (req.url || '').split('?')[0];
        if (SPA_ROUTES.includes(cleanPath)) req.url = '/index.html';
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    legacyHtmlRoutes(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'favicon-16.png',
        'favicon-32.png',
        'apple-touch-icon.png',
        'logo.png',
        'logo-dark.png',
        'iems-logo.png',
        'iems-logo-dark.png',
      ],
      manifest: {
        id: '/',
        name: 'IEMS - نظام إدارة الموظفين',
        short_name: 'IEMS',
        description: 'نظام متكامل لإدارة شؤون الموظفين والحضور والغياب والطلبات والتقارير.',
        lang: 'ar',
        dir: 'rtl',
        theme_color: '#065BAB',
        background_color: '#F4F7FB',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/IEMS_System_Guide\.pdf$/],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: /^react$/, replacement: path.resolve(__dirname, './node_modules/react') },
      {
        find: /^react\/(.*)$/,
        replacement: `${path.resolve(__dirname, './node_modules/react')}/$1`,
      },
      { find: /^react-dom$/, replacement: path.resolve(__dirname, './node_modules/react-dom') },
      {
        find: /^react-dom\/(.*)$/,
        replacement: `${path.resolve(__dirname, './node_modules/react-dom')}/$1`,
      },
    ],
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
