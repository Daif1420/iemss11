import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AuthUser, PublicSystemConfigPayload } from '@/types/iems';
import { api, ApiError, authStorage, setUnauthorizedHandler } from '@/lib/api';
import { getPublicSystemConfig, invalidatePublicSystemConfigCache } from '@/lib/systemConfig';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  authLoading: boolean;
  publicConfig: PublicSystemConfigPayload | null;
  isCreator: boolean;
  isHrManager: boolean;
  isAdminUp: boolean;
  isAdminOrHr: boolean;
  isSupervisorUp: boolean;
  isEmployee: boolean;
  loginSession: (token: string, user: AuthUser) => void;
  updateUserProfile: (patch: Partial<AuthUser>) => void;
  refreshPublicConfig: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function unsubscribeDevicePushBestEffort() {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    if (sub) {
      await api('/api/notifications/push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
    }
    const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
    await nav.clearAppBadge?.().catch(() => {});
  } catch {
    // ignore push cleanup errors on logout
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(() => authStorage.getToken());
  const [user, setUser] = useState<AuthUser | null>(() => authStorage.getUser());
  const [authLoading, setAuthLoading] = useState<boolean>(() => !authStorage.getUser());
  const [publicConfig, setPublicConfig] = useState<PublicSystemConfigPayload | null>(null);

  const refreshPublicConfig = useCallback(async () => {
    try {
      invalidatePublicSystemConfigCache();
      const cfg = await getPublicSystemConfig(true);
      if (cfg) setPublicConfig(cfg);
    } catch {
      // ignore transient public config failure
    }
  }, []);

  const logout = useCallback(() => {
    void unsubscribeDevicePushBestEffort().finally(() => {
      void api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    });
    authStorage.clear();
    invalidatePublicSystemConfigCache();
    setToken(null);
    setUser(null);
    setAuthLoading(false);
    setPublicConfig(null);
    navigate('/', { replace: true });
  }, [navigate]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      invalidatePublicSystemConfigCache();
      setToken(null);
      setUser(null);
      setAuthLoading(false);
      setPublicConfig(null);
      navigate('/', { replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    const verifySession = () => {
      api<{ token?: string; user?: AuthUser }>('/api/auth/me')
        .then((res) => {
          if (cancelled) return;
          if (res?.user) {
            const activeToken = res.token || authStorage.getToken() || 'cookie-session';
            authStorage.setSession(activeToken, res.user, false);
            setToken(activeToken);
            setUser(res.user);
            refreshPublicConfig();
          } else {
            authStorage.clear();
            setToken(null);
            setUser(null);
          }
          setAuthLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          if (err instanceof ApiError && err.status === 401) {
            authStorage.clear();
            setToken(null);
            setUser(null);
          }
          setAuthLoading(false);
        });
    };

    verifySession();

    const handleOnline = () => {
      if (!authStorage.getUser()) {
        verifySession();
      }
    };
    window.addEventListener('online', handleOnline);

    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
    };
  }, [refreshPublicConfig]);

  useEffect(() => {
    const activeSeasonal = user
      ? publicConfig?.displayAndFeatures?.seasonalTheme || 'default'
      : 'default';
    if (activeSeasonal === 'default') {
      document.documentElement.removeAttribute('data-seasonal-theme');
    } else {
      document.documentElement.setAttribute('data-seasonal-theme', activeSeasonal);
    }
  }, [user, publicConfig?.displayAndFeatures?.seasonalTheme]);

  const loginSession = useCallback(
    (nextToken: string, nextUser: AuthUser) => {
      authStorage.setSession(nextToken, nextUser, true);
      setToken(nextToken);
      setUser(nextUser);
      setAuthLoading(false);
      refreshPublicConfig();
    },
    [refreshPublicConfig]
  );

  const updateUserProfile = useCallback((patch: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...patch };
      authStorage.updateUser(updated);
      return updated;
    });
  }, []);

  const role = user?.role;
  const isCreator = role === 'system_creator';
  const isHrManager = role === 'hr_manager';
  const isAdminUp = role === 'system_creator' || role === 'admin';
  const isAdminOrHr = isAdminUp || isHrManager;
  const isSupervisorUp = isAdminOrHr || role === 'supervisor';
  const isEmployee = role === 'employee';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        authLoading,
        publicConfig,
        isCreator,
        isHrManager,
        isAdminUp,
        isAdminOrHr,
        isSupervisorUp,
        isEmployee,
        loginSession,
        updateUserProfile,
        refreshPublicConfig,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
