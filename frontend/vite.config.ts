import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
  plugins: [react(), tailwindcss(), legacyHtmlRoutes()],
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
