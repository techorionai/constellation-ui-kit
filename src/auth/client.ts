// The OpenID Connect client of the browser. It uses `oauth4webapi` for PKCE, the request
// checks, the code exchange, the ID token claim checks, the refresh, and the revocation.
// The kit makes no discovery request, because identity sends no CORS headers for it.
import * as oauth from 'oauth4webapi';
import { serverMetadata } from './metadata';
import { AuthError, type AuthUser } from './types';
import { purgeTransactions, saveTransaction, takeTransaction } from './transaction';

export interface ClientConfig {
  /** The issuer of identity. A trailing slash is removed. */
  issuer: string;
  clientId: string;
  /** The permission keys of the application. The kit adds the OpenID scopes. */
  scopes: string[];
  redirectUri: string;
  postLogoutRedirectUri: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  /** Milliseconds since the epoch. */
  expiresAt: number;
  user: AuthUser;
}

export { serverMetadata };

export const OPENID_SCOPES = ['openid', 'email', 'profile', 'offline_access'];

function clientOf(config: ClientConfig): oauth.Client {
  // Identity signs ID tokens with ES256. The default of the library is RS256.
  return { client_id: config.clientId, id_token_signed_response_alg: 'ES256' };
}

// oauth4webapi allows only HTTPS by default. The kit allows HTTP for loopback hosts only.
function isLoopbackHttp(issuer: string): boolean {
  try {
    const url = new URL(issuer);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

/** Throw a configuration error for an `http:` issuer that is not a loopback host. */
export function assertIssuer(issuer: string): void {
  if (issuer.startsWith('http:') && !isLoopbackHttp(issuer)) {
    throw new Error('The issuer must use HTTPS. HTTP is allowed only for localhost.');
  }
}

function requestOptions(config: ClientConfig): { [oauth.allowInsecureRequests]?: boolean } {
  return isLoopbackHttp(config.issuer) ? { [oauth.allowInsecureRequests]: true } : {};
}

export function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) return error;
  if (
    error instanceof oauth.AuthorizationResponseError ||
    error instanceof oauth.ResponseBodyError
  ) {
    return new AuthError(error.error, { description: error.error_description });
  }
  // The message of other errors can hold a value of the response. Do not copy it.
  return new AuthError('invalid_response', {
    description: 'The response of the identity service is not valid.',
  });
}

export interface AuthorizationOptions {
  returnTo: string;
  /** Send `prompt=none`. */
  silent?: boolean;
  /** Send `prompt=login`. */
  forceLogin?: boolean;
  /** Send `max_age`, in seconds. */
  maxAge?: number;
}

/** Make the authorization request and keep its transaction data. */
export async function buildAuthorizationUrl(
  config: ClientConfig,
  options: AuthorizationOptions,
): Promise<URL> {
  const as = serverMetadata(config.issuer);
  const codeVerifier = oauth.generateRandomCodeVerifier();
  const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);
  const state = oauth.generateRandomState();
  const nonce = oauth.generateRandomNonce();
  purgeTransactions();
  saveTransaction(state, {
    codeVerifier,
    nonce,
    returnTo: options.returnTo,
    silent: options.silent === true,
    maxAge: options.maxAge,
    createdAt: Date.now(),
  });
  const url = new URL(as.authorization_endpoint as string);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', [...OPENID_SCOPES, ...config.scopes].join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (options.silent) url.searchParams.set('prompt', 'none');
  else if (options.forceLogin) url.searchParams.set('prompt', 'login');
  if (options.maxAge !== undefined) url.searchParams.set('max_age', String(options.maxAge));
  return url;
}

function userFrom(claims: oauth.IDToken): AuthUser {
  const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
  return {
    sub: claims.sub,
    email: text(claims.email),
    name: text(claims.name),
    amr: Array.isArray(claims.amr)
      ? claims.amr.filter((value): value is string => typeof value === 'string')
      : undefined,
    authTime: typeof claims.auth_time === 'number' ? claims.auth_time : undefined,
  };
}

function tokenSetFrom(result: oauth.TokenEndpointResponse, previous?: TokenSet): TokenSet {
  const claims = oauth.getValidatedIdTokenClaims(result);
  const user = claims ? userFrom(claims) : previous?.user;
  // OpenID Connect Core section 12.2: a refresh gives the same subject.
  if (user && previous && user.sub !== previous.user.sub) {
    throw new AuthError('invalid_response', {
      description: 'The subject of the new ID token is different.',
    });
  }
  if (!user) {
    throw new AuthError('invalid_response', { description: 'The response has no ID token.' });
  }
  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token ?? previous?.refreshToken,
    idToken: result.id_token ?? previous?.idToken,
    expiresAt: Date.now() + (result.expires_in ?? 900) * 1000,
    user,
  };
}

export type CallbackResult =
  | { ok: true; tokens: TokenSet; returnTo: string }
  | { ok: false; error: AuthError; returnTo: string; silent: boolean };

/** Check the callback response, delete its transaction, and exchange the code. */
export async function handleCallback(config: ClientConfig, url: URL): Promise<CallbackResult> {
  purgeTransactions();
  const state = url.searchParams.get('state');
  const transaction = state ? takeTransaction(state) : null;
  if (!state || !transaction) {
    return {
      ok: false,
      error: new AuthError('invalid_state', {
        description: 'The login response does not match a login request.',
      }),
      returnTo: '/',
      silent: false,
    };
  }
  const as = serverMetadata(config.issuer);
  const client = clientOf(config);
  try {
    const params = oauth.validateAuthResponse(as, client, url.searchParams, state);
    const response = await oauth.authorizationCodeGrantRequest(
      as,
      client,
      oauth.None(),
      params,
      config.redirectUri,
      transaction.codeVerifier,
      requestOptions(config),
    );
    const result = await oauth.processAuthorizationCodeResponse(as, client, response, {
      expectedNonce: transaction.nonce,
      requireIdToken: true,
      maxAge: transaction.maxAge ?? oauth.skipAuthTimeCheck,
    });
    return { ok: true, tokens: tokenSetFrom(result), returnTo: transaction.returnTo };
  } catch (error) {
    return {
      ok: false,
      error: toAuthError(error),
      returnTo: transaction.returnTo,
      silent: transaction.silent,
    };
  }
}

/** Use the refresh token. Identity rotates it. The caller must not run two refreshes at once. */
export async function refreshTokens(config: ClientConfig, tokens: TokenSet): Promise<TokenSet> {
  if (!tokens.refreshToken) {
    throw new AuthError('invalid_grant', { description: 'No refresh token.' });
  }
  const as = serverMetadata(config.issuer);
  const client = clientOf(config);
  try {
    const response = await oauth.refreshTokenGrantRequest(
      as,
      client,
      oauth.None(),
      tokens.refreshToken,
      requestOptions(config),
    );
    const result = await oauth.processRefreshTokenResponse(as, client, response);
    return tokenSetFrom(result, tokens);
  } catch (error) {
    throw toAuthError(error);
  }
}

/** Revoke a refresh token family (RFC 7009). */
export async function revokeRefreshToken(config: ClientConfig, token: string): Promise<void> {
  const as = serverMetadata(config.issuer);
  const response = await oauth.revocationRequest(as, clientOf(config), oauth.None(), token, {
    ...requestOptions(config),
    additionalParameters: { token_type_hint: 'refresh_token' },
  });
  await oauth.processRevocationResponse(response);
}

/** Best-effort revoke for a page that closes. Return true if the browser queued the request. */
export function revokeWithBeacon(config: ClientConfig, token: string): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false;
  const as = serverMetadata(config.issuer);
  const body = new URLSearchParams({
    token,
    token_type_hint: 'refresh_token',
    client_id: config.clientId,
  });
  return navigator.sendBeacon(as.revocation_endpoint as string, body);
}

export function buildEndSessionUrl(config: ClientConfig, idToken?: string): URL {
  const as = serverMetadata(config.issuer);
  const url = new URL(as.end_session_endpoint as string);
  if (idToken) url.searchParams.set('id_token_hint', idToken);
  url.searchParams.set('post_logout_redirect_uri', config.postLogoutRedirectUri);
  url.searchParams.set('client_id', config.clientId);
  return url;
}
