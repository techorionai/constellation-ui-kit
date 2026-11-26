import type { ReactNode } from 'react';
import { LoadingState } from '../components/LoadingState';
import { useAuth, useAuthContext } from './AuthProvider';
import { LoginPage } from './LoginPage';

export interface RequireAuthProps {
  children?: ReactNode;
}

/** Shows its children only for a logged-in user. */
export function RequireAuth({ children }: RequireAuthProps) {
  const { loginPage } = useAuthContext();
  const { status } = useAuth();
  if (status === 'loading') return <LoadingState />;
  if (status === 'authenticated') return <>{children}</>;
  return loginPage ?? <LoginPage />;
}
