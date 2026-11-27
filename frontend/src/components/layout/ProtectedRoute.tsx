import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import type { Role } from '@/types/iems';

interface ProtectedRouteProps {
  children: ReactNode;
  roles?: Role[];
}

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { user, token, authLoading } = useAuth();

  if (authLoading) {
    return (
      <div
        dir="rtl"
        className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background text-foreground"
      >
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <p className="text-xs font-bold text-muted-foreground">جاري استعادة الجلسة...</p>
      </div>
    );
  }

  if (!token || !user) {
    return <Navigate to="/" replace />;
  }

  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/home.html" replace />;
  }

  return <>{children}</>;
}
