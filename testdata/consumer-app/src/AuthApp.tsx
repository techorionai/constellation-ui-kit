import { useMemo, useState } from 'react';
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router';
import { Button, Code, NavLink, Stack, Text } from '@mantine/core';
import {
  AppLayout,
  AuthCallback,
  AuthProvider,
  ConstellationProvider,
  ErrorBoundary,
  PageHeader,
  RequireAuth,
  UserMenu,
  createAuthFetch,
  useAuth,
  type NavItem,
} from '@techorionai/constellation-ui-kit';

const CLIENT_ID = (import.meta.env.VITE_CLIENT_ID as string | undefined) ?? 'ui-kit-demo';
const DEFAULT_SCOPES = ['identity:api_token:manage_own'];

/** The integration tests set `demo-scopes` in localStorage to test a wrong scope. */
function readScopes(): string[] {
  try {
    const value = window.localStorage.getItem('demo-scopes');
    if (value) return value.split(' ');
  } catch {
    // Use the default.
  }
  return DEFAULT_SCOPES;
}

function ProtectedPage({ issuer }: { issuer: string }) {
  const auth = useAuth();
  const authFetch = useMemo(
    () => createAuthFetch(auth, { allowedOrigins: [issuer] }),
    [auth, issuer],
  );
  const [result, setResult] = useState('');
  const user = auth.user;

  async function run(action: () => Promise<string>) {
    try {
      setResult(await action());
    } catch (error) {
      setResult(`error: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  return (
    <>
      <PageHeader title="Protected page" description="Only a logged-in user sees this page." />
      <Stack>
        <Text data-testid="user-name">{user?.name}</Text>
        <Text data-testid="user-email">{user?.email}</Text>
        <Text data-testid="user-amr">amr: {user?.amr?.join(',')}</Text>
        <Text data-testid="user-auth-time">auth_time: {user?.authTime}</Text>
        <Button
          onClick={() =>
            void run(async () => {
              const response = await authFetch(`${issuer}/oauth/userinfo`);
              const body = (await response.json()) as { sub?: string };
              return `userinfo ${response.status} sub=${body.sub}`;
            })
          }
        >
          Call userinfo
        </Button>
        <Button
          onClick={() =>
            void run(async () => {
              await auth.getAccessToken({ forceRefresh: true });
              return 'refreshed';
            })
          }
        >
          Refresh token
        </Button>
        <Button
          onClick={() =>
            void run(async () => {
              const token = await auth.getAccessToken();
              const payload = JSON.parse(
                atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')),
              ) as { aud?: string | string[] };
              return `aud=${JSON.stringify(payload.aud)}`;
            })
          }
        >
          Show audience
        </Button>
        <Button variant="default" onClick={() => void auth.stepUp()}>
          Step up
        </Button>
        <Code data-testid="result">{result}</Code>
      </Stack>
    </>
  );
}

/** The integration tests start a login with the return path of the query `returnTo`. */
function HomePage() {
  const auth = useAuth();
  return (
    <>
      <PageHeader title="Home" description="Public page." />
      <Button
        onClick={() =>
          void auth.login(new URLSearchParams(window.location.search).get('returnTo') ?? undefined)
        }
      >
        Log in with return path
      </Button>
    </>
  );
}

function Shell({ issuer }: { issuer: string }) {
  const navigate = useNavigate();
  const navItems: NavItem[] = [
    { label: 'Home', path: '/' },
    { label: 'Protected', path: '/protected' },
  ];
  return (
    <AuthProvider
      issuer={issuer}
      clientId={CLIENT_ID}
      scopes={readScopes()}
      appName="Consumer app"
      navigate={(path) => void navigate(path, { replace: true })}
    >
      <AppLayout
        appName="Consumer app"
        navItems={navItems}
        renderLink={(item) => <NavLink component={Link} to={item.path} label={item.label} />}
        headerRight={<UserMenu />}
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            path="/protected"
            element={
              <RequireAuth>
                <ProtectedPage issuer={issuer} />
              </RequireAuth>
            }
          />
        </Routes>
      </AppLayout>
    </AuthProvider>
  );
}

export function AuthApp({ issuer }: { issuer: string }) {
  return (
    <ConstellationProvider>
      <ErrorBoundary>
        <BrowserRouter>
          <Shell issuer={issuer} />
        </BrowserRouter>
      </ErrorBoundary>
    </ConstellationProvider>
  );
}
