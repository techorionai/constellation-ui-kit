import { vi } from 'vitest';
import type { ClientConfig } from '../auth/client';
import { AuthController } from '../auth/controller';

export const ISSUER = 'http://localhost:8080';
export const CLIENT_ID = 'demo-ui';

export function makeConfig(): ClientConfig {
  return {
    issuer: ISSUER,
    clientId: CLIENT_ID,
    scopes: ['demo:item:read'],
    redirectUri: `${window.location.origin}/auth/callback`,
    postLogoutRedirectUri: `${window.location.origin}/`,
  };
}

function b64url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** An unsigned JWT. The kit does not check the signature of the ID token. */
export function makeJwt(claims: Record<string, unknown>): string {
  return `${b64url(JSON.stringify({ alg: 'ES256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}.c2ln`;
}

export interface Recorded {
  url: string;
  method: string;
  body: URLSearchParams;
}

/** A fake identity token endpoint for the unit tests. */
export class FakeIdentity {
  requests: Recorded[] = [];
  nonce = '';
  expiresIn = 900;
  tokenPrefix = 'access';
  idTokenIss = ISSUER;
  /** Set a token error code for the next refresh. */
  refreshError: string | null = null;
  /** A hook that runs when a revoke request arrives. */
  onRevoke: (() => void) | null = null;
  /** The `sub` claim of the next ID tokens. */
  sub = 'user-1';
  /** A promise that a refresh response waits for. */
  holdRefresh: Promise<void> | null = null;
  /** If true, a revoke request never ends. */
  hangRevoke = false;
  private counter = 0;

  fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    const body = new URLSearchParams(String(init?.body ?? ''));
    this.requests.push({ url, method: init?.method ?? 'GET', body });
    if (url.endsWith('/oauth/token')) {
      if (body.get('grant_type') === 'refresh_token' && this.holdRefresh) await this.holdRefresh;
      return this.token(body);
    }
    if (url.endsWith('/oauth/revoke')) {
      this.onRevoke?.();
      if (this.hangRevoke) return new Promise<Response>(() => undefined);
      return new Response(null, { status: 200 });
    }
    return new Response('not found', { status: 404 });
  });

  private token(body: URLSearchParams): Response {
    const json = (status: number, value: unknown) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    const grant = body.get('grant_type');
    if (grant === 'refresh_token' && this.refreshError) {
      const error = this.refreshError;
      this.refreshError = null;
      return json(400, { error });
    }
    this.counter += 1;
    const now = Math.floor(Date.now() / 1000);
    const claims: Record<string, unknown> = {
      iss: this.idTokenIss,
      sub: this.sub,
      aud: CLIENT_ID,
      iat: now,
      exp: now + this.expiresIn,
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      auth_time: now,
      amr: ['pwd'],
    };
    if (grant === 'authorization_code') claims.nonce = this.nonce;
    return json(200, {
      access_token: `${this.tokenPrefix}-${this.counter}`,
      token_type: 'Bearer',
      expires_in: this.expiresIn,
      refresh_token: `refresh-${this.counter}`,
      id_token: makeJwt(claims),
    });
  }

  tokenRequests(grant?: string): Recorded[] {
    return this.requests.filter(
      (r) => r.url.endsWith('/oauth/token') && (!grant || r.body.get('grant_type') === grant),
    );
  }
}

export interface Harness {
  controller: AuthController;
  identity: FakeIdentity;
  redirects: string[];
  navigated: string[];
}

export function makeHarness(options: { expiresIn?: number; tokenPrefix?: string } = {}): Harness {
  const identity = new FakeIdentity();
  if (options.expiresIn) identity.expiresIn = options.expiresIn;
  if (options.tokenPrefix) identity.tokenPrefix = options.tokenPrefix;
  vi.stubGlobal('fetch', identity.fetch);
  const redirects: string[] = [];
  const navigated: string[] = [];
  const controller = new AuthController({
    config: makeConfig(),
    redirectPath: '/auth/callback',
    navigate: (path) => navigated.push(path),
    redirect: (url) => redirects.push(url),
  });
  return { controller, identity, redirects, navigated };
}

/** Start a login and return the parameters of the authorization request. */
export async function startLogin(harness: Harness, returnTo = '/tickets/1') {
  await harness.controller.login(returnTo);
  const url = new URL(harness.redirects.at(-1)!);
  const state = url.searchParams.get('state')!;
  harness.identity.nonce = url.searchParams.get('nonce')!;
  return { url, state };
}

export function callbackUrl(state: string, code = 'code-1'): URL {
  return new URL(`${window.location.origin}/auth/callback?code=${code}&state=${state}`);
}

/** Log in with the fake identity. */
export async function loginFully(harness: Harness, returnTo = '/tickets/1') {
  const { state } = await startLogin(harness, returnTo);
  return harness.controller.completeCallback(callbackUrl(state));
}
