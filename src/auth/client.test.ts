import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAuthorizationUrl, handleCallback, serverMetadata } from './client';
import { callbackUrl, makeConfig, makeHarness, startLogin, ISSUER } from '../test/auth';

beforeEach(() => window.sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('authorization request', () => {
  // U1
  it('U1 builds the authorization URL', async () => {
    const url = await buildAuthorizationUrl(makeConfig(), { returnTo: '/x' });
    const p = url.searchParams;
    expect(url.origin + url.pathname).toBe(`${ISSUER}/oauth/authorize`);
    expect(p.get('response_type')).toBe('code');
    expect(p.get('client_id')).toBe('demo-ui');
    expect(p.get('redirect_uri')).toBe(`${window.location.origin}/auth/callback`);
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p.get('state')).toBeTruthy();
    expect(p.get('nonce')).toBeTruthy();
    expect(p.get('scope')).toBe('openid email profile offline_access demo:item:read');
    expect(p.get('prompt')).toBeNull();
  });

  // U2
  it('U2 makes a base64url code verifier of 43 characters or more', async () => {
    const url = await buildAuthorizationUrl(makeConfig(), { returnTo: '/x' });
    const state = url.searchParams.get('state')!;
    const stored = JSON.parse(window.sessionStorage.getItem(`constellation-auth:tx:${state}`)!);
    expect(stored.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    const other = await buildAuthorizationUrl(makeConfig(), { returnTo: '/x' });
    expect(other.searchParams.get('state')).not.toBe(state);
  });

  it('sets prompt and max_age', async () => {
    const silent = await buildAuthorizationUrl(makeConfig(), { returnTo: '/x', silent: true });
    expect(silent.searchParams.get('prompt')).toBe('none');
    const up = await buildAuthorizationUrl(makeConfig(), {
      returnTo: '/x',
      forceLogin: true,
      maxAge: 120,
    });
    expect(up.searchParams.get('prompt')).toBe('login');
    expect(up.searchParams.get('max_age')).toBe('120');
  });
});

describe('callback', () => {
  // U4
  it('U4 gives invalid_state and sends no token request for an unknown state', async () => {
    const h = makeHarness();
    const result = await handleCallback(makeConfig(), callbackUrl('unknown'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_state');
    expect(h.identity.requests).toEqual([]);
  });

  // U5
  it('U5 deletes the transaction entry before the token request', async () => {
    const h = makeHarness();
    const { state } = await startLogin(h);
    let present: boolean | null = null;
    h.identity.fetch.mockImplementationOnce(async () => {
      present = window.sessionStorage.getItem(`constellation-auth:tx:${state}`) !== null;
      return new Response(JSON.stringify({ error: 'invalid_grant' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    });
    const result = await handleCallback(makeConfig(), callbackUrl(state));
    expect(present).toBe(false);
    expect(result.ok).toBe(false);
    // A second use of the same response finds no entry.
    const again = await handleCallback(makeConfig(), callbackUrl(state));
    expect(again.ok === false && again.error.code).toBe('invalid_state');
  });

  it('returns the tokens and the user for a valid response', async () => {
    const h = makeHarness();
    const { state } = await startLogin(h, '/tickets/1');
    const result = await handleCallback(makeConfig(), callbackUrl(state));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.returnTo).toBe('/tickets/1');
      expect(result.tokens.user).toMatchObject({ sub: 'user-1', email: 'ada@example.com' });
      expect(result.tokens.user.amr).toEqual(['pwd']);
    }
    const body = h.identity.tokenRequests('authorization_code')[0]!.body;
    expect(body.get('client_id')).toBe('demo-ui');
    expect(body.get('code_verifier')).toBeTruthy();
    expect(body.get('redirect_uri')).toBe(`${window.location.origin}/auth/callback`);
  });

  it('gives the error of an authorization error response', async () => {
    const h = makeHarness();
    const { state } = await startLogin(h);
    const url = new URL(
      `${window.location.origin}/auth/callback?error=invalid_scope&state=${state}`,
    );
    const result = await handleCallback(makeConfig(), url);
    expect(result.ok === false && result.error.code).toBe('invalid_scope');
    expect(h.identity.requests).toEqual([]);
  });
});

describe('server metadata', () => {
  // U13
  it('U13 makes the metadata from the issuer and refuses a wrong iss', async () => {
    const as = serverMetadata('http://localhost:8080/');
    expect(as).toEqual({
      issuer: 'http://localhost:8080',
      authorization_endpoint: 'http://localhost:8080/oauth/authorize',
      token_endpoint: 'http://localhost:8080/oauth/token',
      revocation_endpoint: 'http://localhost:8080/oauth/revoke',
      userinfo_endpoint: 'http://localhost:8080/oauth/userinfo',
      end_session_endpoint: 'http://localhost:8080/oauth/end_session',
    });
    const h = makeHarness();
    h.identity.idTokenIss = 'https://evil.example';
    const { state } = await startLogin(h);
    const result = await handleCallback(makeConfig(), callbackUrl(state));
    expect(result.ok).toBe(false);
    expect(h.identity.requests.some((r) => r.url.includes('openid-configuration'))).toBe(false);
  });
});
