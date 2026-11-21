import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AuthUser } from '@/types/iems';
import { api, authStorage, setUnauthorizedHandler } from '@/lib/api';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isCreator: boolean;
  isAdminUp: boolean;
  isSupervisorUp: boolean;
  isEmployee: boolean;
  loginSession: (token: string, user: AuthUser) => void;
  updateUserProfile: (patch: Partial<AuthUser>) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(() => authStorage.getToken());
  const [user, setUser] = useState<AuthUser | null>(() => authStorage.getUser());

  const logout = useCallback(() => {
    authStorage.clear();
    setToken(null);
    setUser(null);
    navigate('/', { replace: true });
  }, [navigate]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
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
    return () => {
      cancelled = true;
    };
  }, [token]);

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
  const isAdminUp = role === 'system_creator' || role === 'admin';
  const isSupervisorUp = isAdminUp || role === 'supervisor';
  const isEmployee = role === 'employee';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isCreator,
        isAdminUp,
        isSupervisorUp,
        isEmployee,
        loginSession,
        updateUserProfile,
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
