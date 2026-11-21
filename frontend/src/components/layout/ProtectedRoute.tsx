import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import type { Role } from '@/types/iems';

interface ProtectedRouteProps {
  children: ReactNode;
  roles?: Role[];
}

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { user, token } = useAuth();

  if (!token || !user) {
    return <Navigate to="/" replace />;
  }

  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/home.html" replace />;
  }

  return <>{children}</>;
}
