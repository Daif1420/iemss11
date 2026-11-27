import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AuthUser, PublicSystemConfigPayload } from '@/types/iems';
import { api, authStorage, setUnauthorizedHandler } from '@/lib/api';
import { getPublicSystemConfig, invalidatePublicSystemConfigCache } from '@/lib/systemConfig';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(() => authStorage.getToken());
  const [user, setUser] = useState<AuthUser | null>(() => authStorage.getUser());
  const [publicConfig, setPublicConfig] = useState<PublicSystemConfigPayload | null>(null);

  const refreshPublicConfig = useCallback(async () => {
    if (!authStorage.getToken()) return;
    try {
      invalidatePublicSystemConfigCache();
      const cfg = await getPublicSystemConfig(true);
      if (cfg) setPublicConfig(cfg);
    } catch {
      // ignore transient public config failure
    }
  }, []);

  const logout = useCallback(() => {
    authStorage.clear();
    invalidatePublicSystemConfigCache();
    setToken(null);
    setUser(null);
    setPublicConfig(null);
    navigate('/', { replace: true });
  }, [navigate]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      invalidatePublicSystemConfigCache();
      setToken(null);
      setUser(null);
      setPublicConfig(null);
      navigate('/', { replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api<{ user?: AuthUser }>('/api/auth/me')
      .then((res) => {
        if (cancelled || !res?.user) return;
        setUser((prev) => {
          const merged = { ...prev, ...res.user } as AuthUser;
          authStorage.updateUser(merged);
          return merged;
        });
      })
      .catch(() => {
        // ignore transient refresh failure; 401 is handled globally
      });
    refreshPublicConfig();
    return () => {
      cancelled = true;
    };
  }, [token, refreshPublicConfig]);

  useEffect(() => {
    const activeSeasonal = token
      ? publicConfig?.displayAndFeatures?.seasonalTheme || 'default'
      : 'default';
    if (activeSeasonal === 'default') {
      document.documentElement.removeAttribute('data-seasonal-theme');
    } else {
      document.documentElement.setAttribute('data-seasonal-theme', activeSeasonal);
    }
  }, [token, publicConfig?.displayAndFeatures?.seasonalTheme]);

  const loginSession = useCallback((nextToken: string, nextUser: AuthUser) => {
    authStorage.setSession(nextToken, nextUser, true);
    setToken(nextToken);
    setUser(nextUser);
  }, []);

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
