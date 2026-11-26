import { StrictMode, useState, type ReactNode } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithProvider } from '../test/render';
import { makeHarness, ISSUER, CLIENT_ID } from '../test/auth';
import { AuthCallback } from './AuthCallback';
import { AuthProvider, useAuth } from './AuthProvider';
import { LoginPage } from './LoginPage';
import { RequireAuth } from './RequireAuth';
import { UserMenu } from './UserMenu';

const redirects: string[] = [];
const redirect = (url: string) => {
  redirects.push(url);
};

function Provider({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) {
  return (
    <AuthProvider
      issuer={ISSUER}
      clientId={CLIENT_ID}
      scopes={['demo:item:read']}
      appName="Helpdesk"
      redirect={redirect}
      {...props}
    >
      {children}
    </AuthProvider>
  );
}

/** A small router: the callback route shows AuthCallback, other paths show the page. */
function App({ page }: { page: ReactNode }) {
  const [path, setPath] = useState(window.location.pathname);
  return (
    <Provider
      navigate={(next: string) => {
        window.history.replaceState({}, '', next);
        setPath(new URL(next, window.location.origin).pathname);
      }}
    >
      {path === '/auth/callback' ? <AuthCallback /> : page}
    </Provider>
  );
}

function returnFrom(search: string) {
  window.history.replaceState({}, '', `/auth/callback${search}`);
}

beforeEach(() => {
  redirects.length = 0;
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/protected');
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

/** Make a transaction as if the page had started a login, and return the state. */
async function pendingLogin(silent = false): Promise<{ state: string; nonce: string }> {
  const h = makeHarness();
  const location = window.location.pathname;
  await h.controller.login(location);
  const url = new URL(h.redirects[0]!);
  if (silent) {
    const state = url.searchParams.get('state')!;
    const key = `constellation-auth:tx:${state}`;
    const tx = JSON.parse(window.sessionStorage.getItem(key)!);
    window.sessionStorage.setItem(key, JSON.stringify({ ...tx, silent: true }));
  }
  return { state: url.searchParams.get('state')!, nonce: url.searchParams.get('nonce')! };
}

describe('silent login and callback', () => {
  // U12
  it('U12 shows LoginPage after login_required and makes no second silent request', async () => {
    const first = renderWithProvider(<App page={<RequireAuth>secret page</RequireAuth>} />);
    // The page load makes one silent request.
    await waitFor(() => expect(redirects).toHaveLength(1));
    const silent = new URL(redirects[0]!);
    expect(silent.searchParams.get('prompt')).toBe('none');
    first.unmount();
    redirects.length = 0;
    // The page load after the redirect has the error in its address.
    returnFrom(`?error=login_required&state=${silent.searchParams.get('state')}`);
    renderWithProvider(<App page={<RequireAuth>secret page</RequireAuth>} />);
    expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.queryByText('secret page')).not.toBeInTheDocument();
    expect(redirects).toEqual([]);
  });

  // U19
  it('U19 calls navigate one time with the return path and removes code and state', async () => {
    const { state, nonce } = await pendingLogin();
    const h = makeHarness();
    h.identity.nonce = nonce;
    returnFrom(`?code=abc&state=${state}`);
    const navigate = vi.fn();
    renderWithProvider(
      <StrictMode>
        <Provider navigate={navigate}>
          <AuthCallback />
        </Provider>
      </StrictMode>,
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(navigate).toHaveBeenCalledWith('/protected');
    expect(window.location.search).toBe('');
    expect(window.location.href).not.toContain('code=');
    expect(window.location.href).not.toContain('state=');
  });

  // U20
  it('U20 uses history.replaceState and a popstate event with no navigate prop', async () => {
    const { state, nonce } = await pendingLogin();
    const h = makeHarness();
    h.identity.nonce = nonce;
    returnFrom(`?code=abc&state=${state}`);
    const popstate = vi.fn();
    window.addEventListener('popstate', popstate);
    renderWithProvider(
      <Provider>
        <AuthCallback />
      </Provider>,
    );
    await waitFor(() => expect(popstate).toHaveBeenCalledTimes(1));
    window.removeEventListener('popstate', popstate);
    expect(window.location.pathname).toBe('/protected');
    expect(window.location.search).toBe('');
  });

  it('shows the error and a Try again button for an authorization error', async () => {
    const { state } = await pendingLogin();
    returnFrom(`?error=invalid_scope&state=${state}`);
    renderWithProvider(
      <Provider>
        <AuthCallback />
      </Provider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid_scope');
    redirects.length = 0;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(redirects).toHaveLength(1));
  });

  it('shows the error view for a state with no transaction', async () => {
    returnFrom('?code=x&state=unknown');
    makeHarness();
    renderWithProvider(
      <Provider>
        <AuthCallback />
      </Provider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid_state');
  });
});

describe('LoginPage', () => {
  // U22
  it('U22 shows the appName of the provider or of the prop', () => {
    window.history.replaceState({}, '', '/auth/callback');
    const first = renderWithProvider(
      <Provider>
        <LoginPage />
      </Provider>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Helpdesk' })).toBeInTheDocument();
    first.unmount();
    renderWithProvider(
      <Provider>
        <LoginPage appName="Other" />
      </Provider>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Other' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

describe('accessibility', () => {
  // U17
  it('U17 has no violation in LoginPage, UserMenu, and the error view of AuthCallback', async () => {
    window.history.replaceState({}, '', '/auth/callback');
    const login = renderWithProvider(
      <Provider>
        <LoginPage />
      </Provider>,
    );
    expect(await axe(login.container)).toHaveNoViolations();
    login.unmount();

    const { state } = await pendingLogin();
    returnFrom(`?error=access_denied&state=${state}`);
    const callback = renderWithProvider(
      <Provider>
        <AuthCallback />
      </Provider>,
    );
    await screen.findByRole('alert');
    expect(await axe(callback.container)).toHaveNoViolations();
    callback.unmount();

    // UserMenu needs a logged-in user.
    const { state: s2, nonce } = await pendingLogin();
    const h = makeHarness();
    h.identity.nonce = nonce;
    returnFrom(`?code=abc&state=${s2}`);
    function Menu() {
      const { status } = useAuth();
      return (
        <>
          <span>{status}</span>
          <UserMenu />
        </>
      );
    }
    const menu = renderWithProvider(
      <Provider navigate={() => {}}>
        <AuthCallback />
        <Menu />
      </Provider>,
    );
    await waitFor(() => expect(screen.getByText('authenticated')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'User menu' }));
    expect(
      await screen.findByRole('menuitem', { name: 'Log out', hidden: true }),
    ).toBeInTheDocument();
    expect(await axe(menu.container)).toHaveNoViolations();
    const link = screen.getByRole('menuitem', { name: 'Account security', hidden: true });
    expect(link).toHaveAttribute('href', `${ISSUER}/account/security`);
  });
});

/** Log in through the callback and show the status. Render the children after it. */
async function renderLoggedIn(children: ReactNode, props: Record<string, unknown> = {}) {
  const { state, nonce } = await pendingLogin();
  const h = makeHarness();
  h.identity.nonce = nonce;
  returnFrom(`?code=abc&state=${state}`);
  function Status() {
    const { status } = useAuth();
    return <span data-testid="status">{status}</span>;
  }
  const view = renderWithProvider(
    <Provider navigate={() => {}} {...props}>
      <AuthCallback />
      <Status />
      {children}
    </Provider>,
  );
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
  return { view, h };
}

describe('review fixes', () => {
  // R8
  it('R8 RequireAuth shows the loading view, the custom login page, and the children', async () => {
    window.history.replaceState({}, '', '/auth/callback');
    const loading = renderWithProvider(
      <Provider>
        <RequireAuth>secret page</RequireAuth>
      </Provider>,
    );
    expect(screen.queryByText('secret page')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log in' })).not.toBeInTheDocument();
    loading.unmount();

    const { state } = await pendingLogin(true);
    returnFrom(`?error=login_required&state=${state}`);
    const custom = renderWithProvider(
      <Provider loginPage={<p>custom login</p>}>
        <AuthCallback />
        <RequireAuth>secret page</RequireAuth>
      </Provider>,
    );
    expect(await screen.findByText('custom login')).toBeInTheDocument();
    expect(screen.queryByText('secret page')).not.toBeInTheDocument();
    custom.unmount();

    window.sessionStorage.clear();
    await renderLoggedIn(<RequireAuth>secret page</RequireAuth>);
    expect(screen.getByText('secret page')).toBeInTheDocument();
  });

  // R8
  it('R8 the Log out item of UserMenu goes to the end session URL', async () => {
    await renderLoggedIn(<UserMenu />);
    redirects.length = 0;
    await userEvent.click(screen.getByRole('button', { name: 'User menu' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Log out', hidden: true }));
    await waitFor(() => expect(redirects).toHaveLength(1));
    expect(new URL(redirects[0]!).pathname).toBe('/oauth/end_session');
  });

  // R7
  it('R7 keeps the tokens when appName and navigate change', async () => {
    const { state, nonce } = await pendingLogin();
    const h = makeHarness();
    h.identity.nonce = nonce;
    returnFrom(`?code=abc&state=${state}`);
    function Status() {
      const { status } = useAuth();
      return <span data-testid="status">{status}</span>;
    }
    function Wrapper() {
      const [name, setName] = useState('Helpdesk');
      return (
        <Provider appName={name} navigate={() => {}}>
          <AuthCallback />
          <Status />
          <button onClick={() => setName('Other')}>rename</button>
        </Provider>
      );
    }
    renderWithProvider(<Wrapper />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    await userEvent.click(screen.getByRole('button', { name: 'rename' }));
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
  });
});
