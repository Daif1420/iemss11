import { useCallback, useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let cachedPrompt: BeforeInstallPromptEvent | null = null;
let cachedInstalled = false;
const listeners = new Set<() => void>();

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isAppleMobile = /iphone|ipad|ipod/.test(ua);
  const isIPadOS =
    window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
  return isAppleMobile || isIPadOS;
}

if (typeof window !== 'undefined') {
  cachedInstalled = detectStandalone();

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    cachedPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((fn) => fn());
  });

  window.addEventListener('appinstalled', () => {
    cachedInstalled = true;
    cachedPrompt = null;
    listeners.forEach((fn) => fn());
  });
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => cachedPrompt
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(
    () => cachedInstalled || detectStandalone()
  );
  const [isIOS] = useState<boolean>(() => detectIOS());

  useEffect(() => {
    const sync = () => {
      setDeferredPrompt(cachedPrompt);
      setIsInstalled(cachedInstalled || detectStandalone());
    };
    listeners.add(sync);
    sync();

    const mq = window.matchMedia('(display-mode: standalone)');
    const onDisplayChange = () => sync();
    if (mq.addEventListener) mq.addEventListener('change', onDisplayChange);

    return () => {
      listeners.delete(sync);
      if (mq.removeEventListener) mq.removeEventListener('change', onDisplayChange);
    };
  }, []);

  const install = useCallback(async () => {
    const promptEvent = cachedPrompt || deferredPrompt;
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      cachedInstalled = true;
      cachedPrompt = null;
      listeners.forEach((fn) => fn());
      return true;
    }
    return false;
  }, [deferredPrompt]);

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}
