import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';

interface SWWindowClient {
  url: string;
  focused?: boolean;
  focus: () => Promise<SWWindowClient>;
  navigate?: (url: string) => Promise<SWWindowClient | null>;
  postMessage: (message: unknown) => void;
}

interface SWNotification extends Notification {
  data: { url?: string; type?: string } | null;
}

interface SWPushEvent extends Event {
  data?: {
    json: () => unknown;
    text: () => string;
  } | null;
  waitUntil: (promise: Promise<unknown>) => void;
}

interface SWNotificationEvent extends Event {
  notification: SWNotification;
  waitUntil: (promise: Promise<unknown>) => void;
}

interface SWExtendableEvent extends Event {
  waitUntil: (promise: Promise<unknown>) => void;
}

interface SWGlobalScope {
  __WB_MANIFEST?: Array<PrecacheEntry | string>;
  location: Location;
  navigator: Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  registration: ServiceWorkerRegistration & {
    showNotification: (
      title: string,
      options?: NotificationOptions & {
        vibrate?: number[];
        renotify?: boolean;
      }
    ) => Promise<void>;
  };
  clients: {
    matchAll: (opts?: { type?: 'window' | 'worker' | 'sharedworker' | 'all'; includeUncontrolled?: boolean }) => Promise<SWWindowClient[]>;
    openWindow: (url: string) => Promise<SWWindowClient | null>;
  };
  skipWaiting: () => Promise<void>;
  addEventListener: {
    (type: 'push', listener: (event: SWPushEvent) => void): void;
    (type: 'notificationclick', listener: (event: SWNotificationEvent) => void): void;
    (type: 'message', listener: (event: MessageEvent) => void): void;
    (type: 'activate', listener: (event: SWExtendableEvent) => void): void;
  };
}

declare const self: SWGlobalScope;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

const manifest = self.__WB_MANIFEST || [];
if (manifest.length > 0) {
  precacheAndRoute(manifest);
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL('/index.html'), {
      denylist: [/^\/api\//, /^\/IEMS_System_Guide\.pdf$/],
    })
  );
}

// Never cache API calls so auth state, notifications, and live workforce data stay fresh
registerRoute(({ url }) => url.pathname.startsWith('/api/'), new NetworkOnly());

// Cache Google Fonts stylesheets & static font files
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'gstatic-fonts-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

function normalizeNotificationUrl(raw?: unknown): string {
  const s = String(raw || '').trim();
  if (!s || s.startsWith('javascript:') || s.startsWith('data:')) {
    return '/requests.html';
  }
  if (s.startsWith('/')) return s;
  try {
    const parsed = new URL(s);
    if (parsed.origin === self.location.origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // ignore malformed URL
  }
  return '/requests.html';
}

self.addEventListener('push', (event) => {
  let payload: {
    type?: string;
    title?: string;
    body?: string;
    link?: string;
    unreadCount?: number;
    tag?: string;
  } = {};

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        payload = parsed as typeof payload;
      }
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || 'إشعار جديد — IEMS';
  const body = payload.body || 'لديك تحديث جديد في النظام.';
  const targetUrl = normalizeNotificationUrl(payload.link);
  const unreadCount = Number(payload.unreadCount || 0);

  const tasks: Promise<unknown>[] = [
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      dir: 'rtl',
      lang: 'ar',
      tag: payload.tag || `iems-notif-${payload.type || 'general'}`,
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: targetUrl, type: payload.type || 'general' },
    }),
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        windowClients.forEach((client) => {
          client.postMessage({
            type: 'IEMS_PUSH_RECEIVED',
            payload: {
              type: payload.type,
              title,
              body,
              link: targetUrl,
              unreadCount,
            },
          });
        });
      }),
  ];

  if (typeof self.navigator?.setAppBadge === 'function') {
    if (unreadCount > 0) {
      tasks.push(self.navigator.setAppBadge(unreadCount).catch(() => {}));
    } else if (typeof self.navigator?.clearAppBadge === 'function') {
      tasks.push(self.navigator.clearAppBadge().catch(() => {}));
    }
  }

  event.waitUntil(Promise.all(tasks));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = normalizeNotificationUrl(event.notification?.data?.url);
  const fullTargetUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (windowClients) => {
        for (const client of windowClients) {
          try {
            const clientUrl = new URL(client.url);
            if (clientUrl.origin === self.location.origin) {
              await client.focus();
              client.postMessage({ type: 'IEMS_NAVIGATE', url: targetUrl });
              return client;
            }
          } catch {
            // ignore bad URL
          }
        }
        return self.clients.openWindow(fullTargetUrl);
      })
  );
});

self.addEventListener('message', (event) => {
  const data = event.data as { type?: string } | null;
  if (data?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});
