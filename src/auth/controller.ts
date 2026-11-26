// The auth state of one tab. The tokens stay in the memory of this object only.
import {
  assertIssuer,
  buildAuthorizationUrl,
  buildEndSessionUrl,
  handleCallback,
  refreshTokens,
  revokeRefreshToken,
  revokeWithBeacon,
  type ClientConfig,
  type TokenSet,
} from './client';
import { safeReturnPath } from './transaction';
import { AuthError, type AuthApi, type AuthState } from './types';

/** The access token must have at least this life left (milliseconds). */
const REFRESH_MARGIN_MS = 60_000;

export interface ControllerOptions {
  config: ClientConfig;
  /** The path of the callback route. */
  redirectPath: string;
  /** Go to a local path with no page load. */
  navigate: (path: string) => void;
  /** Go to an URL with a page load. The default is `window.location.assign`. */
  redirect?: (url: string) => void;
}

export type CallbackOutcome =
  | { kind: 'success'; returnTo: string }
  | { kind: 'unauthenticated'; returnTo: string }
  | { kind: 'error'; error: AuthError; returnTo: string };

/** The revoke request at logout can take this long (milliseconds). Then the logout goes on. */
const REVOKE_TIMEOUT_MS = 3000;

function currentPath(): string {
  const { pathname, search, hash } = window.location;
  return safeReturnPath(pathname + search + hash);
}

export class AuthController {
  readonly config: ClientConfig;
  private readonly redirectPath: string;
  private navigateTo: (path: string) => void;
  private redirectTo: (url: string) => void;
  private state: AuthState = { status: 'loading', user: null, error: null };
  private tokens: TokenSet | null = null;
  private readonly listeners = new Set<() => void>();
  private refreshing: Promise<TokenSet> | null = null;
  private silentStarted = false;
  private callback: Promise<CallbackOutcome> | null = null;
  /** Each clear or logout increases it. A refresh that ends after a change must not keep tokens. */
  private session = 0;
  private channel: BroadcastChannel | null = null;

  constructor(options: ControllerOptions) {
    assertIssuer(options.config.issuer);
    this.config = options.config;
    this.redirectPath = options.redirectPath;
    this.navigateTo = options.navigate;
    this.redirectTo = options.redirect ?? ((url) => window.location.assign(url));
  }

  /** Replace the navigation functions. The provider calls it when its props change. */
  setHandlers(handlers: {
    navigate: (path: string) => void;
    redirect?: (url: string) => void;
  }): void {
    this.navigateTo = handlers.navigate;
    this.redirectTo = handlers.redirect ?? ((url) => window.location.assign(url));
  }

  // The functions below are arrow properties, so a caller can pass them around.

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): AuthState => this.state;

  private setState(next: AuthState): void {
    this.state = next;
    for (const listener of [...this.listeners]) listener();
  }

  private clear(): void {
    this.session += 1;
    this.tokens = null;
    this.setState({ status: 'unauthenticated', user: null, error: null });
  }

  /** Start the silent login and the tab events. Return a function that stops the events. */
  start(): () => void {
    const onPageHide = (event: PageTransitionEvent) => {
      // A page in the back/forward cache can come back, so it keeps its token.
      if (!event.persisted && this.tokens?.refreshToken) {
        revokeWithBeacon(this.config, this.tokens.refreshToken);
      }
    };
    window.addEventListener('pagehide', onPageHide);
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`constellation-auth:${this.config.clientId}`);
      this.channel.onmessage = (event: MessageEvent) => {
        if ((event.data as { type?: string } | null)?.type === 'logout') this.clear();
      };
    }
    if (window.location.pathname !== this.redirectPath) void this.silentLogin();
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      this.channel?.close();
      this.channel = null;
    };
  }

  private async silentLogin(): Promise<void> {
    // One silent request for each page load. This stops a redirect loop.
    if (this.silentStarted) return;
    this.silentStarted = true;
    try {
      await this.authorize({ returnTo: currentPath(), silent: true });
    } catch (error) {
      this.setState({
        status: 'error',
        user: null,
        error: error instanceof AuthError ? error : new AuthError('login_failed'),
      });
    }
  }

  private async authorize(options: {
    returnTo: string;
    silent?: boolean;
    forceLogin?: boolean;
    maxAge?: number;
  }): Promise<void> {
    const url = await buildAuthorizationUrl(this.config, options);
    this.redirectTo(url.href);
  }

  /** Revoke a refresh token. A slow identity service does not block the caller for long. */
  private async revokeWithLimit(token: string): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, REVOKE_TIMEOUT_MS);
    });
    try {
      await Promise.race([revokeRefreshToken(this.config, token).catch(() => undefined), limit]);
    } finally {
      clearTimeout(timer);
    }
  }

  login = async (returnTo?: string): Promise<void> => {
    await this.authorize({ returnTo: safeReturnPath(returnTo ?? currentPath()) });
  };

  stepUp = async (maxAge = 300): Promise<void> => {
    // Build the request first. If the build fails, the tab keeps its tokens.
    const url = await buildAuthorizationUrl(this.config, {
      returnTo: currentPath(),
      forceLogin: true,
      maxAge,
    });
    const refreshToken = this.tokens?.refreshToken;
    if (refreshToken && this.tokens) {
      // Each login makes a new refresh family. Revoke the old one first.
      this.tokens = { ...this.tokens, refreshToken: undefined };
      await this.revokeWithLimit(refreshToken);
    }
    this.redirectTo(url.href);
  };

  logout = async (): Promise<void> => {
    const tokens = this.tokens;
    this.session += 1;
    this.setState({ status: 'loading', user: null, error: null });
    this.tokens = null;
    // End session at identity revokes the families too. A failed or slow revoke does not stop it.
    if (tokens?.refreshToken) await this.revokeWithLimit(tokens.refreshToken);
    this.channel?.postMessage({ type: 'logout' });
    this.redirectTo(buildEndSessionUrl(this.config, tokens?.idToken).href);
  };

  getAccessToken = async (options: { forceRefresh?: boolean } = {}): Promise<string> => {
    if (!this.tokens)
      throw new AuthError('login_required', { description: 'No user is logged in.' });
    const stale = this.tokens.expiresAt - Date.now() < REFRESH_MARGIN_MS;
    if (options.forceRefresh || stale) return (await this.refresh()).accessToken;
    return this.tokens.accessToken;
  };

  /** All refresh calls of the tab share one promise (single flight). */
  private refresh(): Promise<TokenSet> {
    if (!this.refreshing) {
      const current = this.tokens;
      const session = this.session;
      this.refreshing = (async () => {
        if (!current) throw new AuthError('login_required');
        try {
          const next = await refreshTokens(this.config, current);
          if (session !== this.session) {
            // A logout or a clear ran during the request. Do not log in again.
            if (next.refreshToken) await this.revokeWithLimit(next.refreshToken);
            throw new AuthError('login_required', { description: 'The user logged out.' });
          }
          this.tokens = next;
          this.setState({ status: 'authenticated', user: next.user, error: null });
          return next;
        } catch (error) {
          if (
            error instanceof AuthError &&
            error.code === 'invalid_grant' &&
            session === this.session
          ) {
            this.clear();
            try {
              await this.login(currentPath());
            } catch {
              // The user can start the login with the button.
            }
          }
          throw error;
        }
      })().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  /** Check the callback response one time. A second call returns the same result. */
  completeCallback(url: URL = new URL(window.location.href)): Promise<CallbackOutcome> {
    this.callback ??= this.runCallback(url);
    return this.callback;
  }

  private async runCallback(url: URL): Promise<CallbackOutcome> {
    const result = await handleCallback(this.config, url);
    if (result.ok) {
      this.tokens = result.tokens;
      this.setState({ status: 'authenticated', user: result.tokens.user, error: null });
      return { kind: 'success', returnTo: result.returnTo };
    }
    // Any error of a silent request means that the tab has no session.
    if (result.silent) {
      this.clear();
      return { kind: 'unauthenticated', returnTo: result.returnTo };
    }
    this.tokens = null;
    this.setState({ status: 'error', user: null, error: result.error });
    return { kind: 'error', error: result.error, returnTo: result.returnTo };
  }

  /** Remove the response parameters from the address. Then go to the return path. */
  finishCallback(returnTo: string): void {
    window.history.replaceState(window.history.state, '', window.location.pathname);
    this.navigateTo(safeReturnPath(returnTo));
  }

  /** The public part of the controller. */
  api(): Pick<AuthApi, 'login' | 'logout' | 'stepUp' | 'getAccessToken'> {
    return {
      login: this.login,
      logout: this.logout,
      stepUp: this.stepUp,
      getAccessToken: this.getAccessToken,
    };
  }
}
