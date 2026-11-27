import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

type PushPermissionState = NotificationPermission | 'unsupported';

interface PushConfigResponse {
  supported: boolean;
  publicKey: string | null;
  subscribed: boolean;
}

interface SwPushMessage {
  type?: string;
  url?: string;
  payload?: {
    type?: string;
    title?: string;
    body?: string;
    link?: string;
    unreadCount?: number;
  };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function syncAppBadge(unreadCount: number) {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (unreadCount > 0 && typeof nav.setAppBadge === 'function') {
    void nav.setAppBadge(unreadCount).catch(() => {});
  } else if (unreadCount <= 0 && typeof nav.clearAppBadge === 'function') {
    void nav.clearAppBadge().catch(() => {});
  }
}

export async function showServiceWorkerNotification({
  title,
  body,
  link = '/requests.html',
  tag = 'iems-notif',
}: {
  title: string;
  body?: string;
  link?: string;
  tag?: string;
}): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, {
          body: body || '',
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          dir: 'rtl',
          lang: 'ar',
          tag,
          data: { url: link },
        });
        return true;
      }
    }
    new Notification(title, {
      body: body || '',
      icon: '/pwa-192x192.png',
      dir: 'rtl',
      lang: 'ar',
      tag,
    });
    return true;
  } catch {
    return false;
  }
}

export function usePushNotifications({
  enabled,
  onPushReceived,
  onNavigate,
}: {
  enabled: boolean;
  onPushReceived?: (payload: NonNullable<SwPushMessage['payload']>) => void;
  onNavigate?: (url: string) => void;
}) {
  const isNotificationSupported = typeof window !== 'undefined' && 'Notification' in window;
  const isPushSupported =
    isNotificationSupported && 'serviceWorker' in navigator && 'PushManager' in window;

  const [permission, setPermission] = useState<PushPermissionState>(() =>
    isNotificationSupported ? Notification.permission : 'unsupported'
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [serverSupported, setServerSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const vapidKeyRef = useRef<string | null>(null);
  const onPushRef = useRef(onPushReceived);
  const onNavRef = useRef(onNavigate);
  onPushRef.current = onPushReceived;
  onNavRef.current = onNavigate;

  const syncSubscriptionWithServer = useCallback(
    async (createIfMissing: boolean): Promise<boolean> => {
      if (!enabled || !isPushSupported) return false;
      try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        const endpointParam = sub?.endpoint ? `?endpoint=${encodeURIComponent(sub.endpoint)}` : '';
        const cfg = await api<PushConfigResponse>(`/api/notifications/push/config${endpointParam}`);
        setServerSupported(Boolean(cfg.supported));
        if (cfg.publicKey) vapidKeyRef.current = cfg.publicKey;

        if (!sub && createIfMissing && Notification.permission === 'granted' && cfg.publicKey) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(cfg.publicKey),
          });
        }

        if (sub) {
          const json = sub.toJSON();
          if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
            await api('/api/notifications/push/subscribe', {
              method: 'POST',
              body: JSON.stringify({ subscription: json }),
            });
            setIsSubscribed(true);
            return true;
          }
        }
        setIsSubscribed(false);
        return false;
      } catch {
        return false;
      }
    },
    [enabled, isPushSupported]
  );

  // Listen to Service Worker push & click messages
  useEffect(() => {
    if (!enabled || !('serviceWorker' in navigator)) return;
    const handleMessage = (event: MessageEvent) => {
      const msg = (event.data || {}) as SwPushMessage;
      if (msg.type === 'IEMS_PUSH_RECEIVED' && msg.payload) {
        if (typeof msg.payload.unreadCount === 'number') {
          syncAppBadge(msg.payload.unreadCount);
        }
        onPushRef.current?.(msg.payload);
      } else if (msg.type === 'IEMS_NAVIGATE' && msg.url) {
        onNavRef.current?.(msg.url);
      }
    };
    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [enabled]);

  // Automatically attach push subscription on login if user already granted permission
  useEffect(() => {
    if (!enabled) {
      setIsSubscribed(false);
      return;
    }
    if (isNotificationSupported) {
      setPermission(Notification.permission);
    }
    if (isPushSupported && Notification.permission === 'granted') {
      void syncSubscriptionWithServer(true);
    } else if (isPushSupported) {
      void syncSubscriptionWithServer(false);
    }
  }, [enabled, isNotificationSupported, isPushSupported, syncSubscriptionWithServer]);

  const enablePushNotifications = useCallback(async (): Promise<{
    ok: boolean;
    reason?: 'unsupported' | 'denied' | 'error';
  }> => {
    if (!isNotificationSupported) {
      return { ok: false, reason: 'unsupported' };
    }
    setBusy(true);
    try {
      const nextPerm = await Notification.requestPermission();
      setPermission(nextPerm);
      if (nextPerm !== 'granted') {
        return { ok: false, reason: 'denied' };
      }
      const subscribed = await syncSubscriptionWithServer(true);
      await showServiceWorkerNotification({
        title: 'تم تفعيل إشعارات نظام IEMS',
        body: 'ستصلك تنبيهات الطلبات والاعتماد مباشرة على جهازك.',
        link: '/requests.html',
        tag: 'iems-push-enabled',
      });
      return { ok: subscribed || nextPerm === 'granted' };
    } catch {
      return { ok: false, reason: 'error' };
    } finally {
      setBusy(false);
    }
  }, [isNotificationSupported, syncSubscriptionWithServer]);

  const disablePushNotifications = useCallback(async () => {
    if (!isPushSupported) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api('/api/notifications/push/unsubscribe', {
          method: 'POST',
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setIsSubscribed(false);
    } finally {
      setBusy(false);
    }
  }, [isPushSupported]);

  const sendTestPush = useCallback(async () => {
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; sent?: number }>('/api/notifications/push/test', {
        method: 'POST',
      });
      if (!res?.sent) {
        await showServiceWorkerNotification({
          title: 'إشعار تجريبي — IEMS',
          body: 'الإشعارات المحلية تعمل على هذا الجهاز بنجاح.',
          link: '/requests.html',
          tag: 'iems-push-test',
        });
      }
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    isNotificationSupported,
    isPushSupported,
    serverSupported,
    permission,
    isSubscribed,
    busy,
    enablePushNotifications,
    disablePushNotifications,
    sendTestPush,
  };
}
