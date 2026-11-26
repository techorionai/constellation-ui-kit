/** The state of the login of one tab. */
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

/** The user data that come from the ID token. */
export interface AuthUser {
  sub: string;
  email?: string;
  name?: string;
  /** Authentication methods references of the login (`amr` claim). */
  amr?: string[];
  /** Time of the last password login, in seconds since the epoch (`auth_time` claim). */
  authTime?: number;
}

/**
 * An OAuth error. The OAuth endpoints use the RFC 6749 error form, not RFC 9457,
 * so this type is separate from `Problem`.
 */
export class AuthError extends Error {
  readonly code: string;
  readonly description?: string;
  /** Set only for `insufficient_user_authentication`. */
  readonly maxAge?: number;

  constructor(code: string, options: { description?: string; maxAge?: number } = {}) {
    super(options.description ? `${code}: ${options.description}` : code);
    this.name = 'AuthError';
    this.code = code;
    this.description = options.description;
    this.maxAge = options.maxAge;
  }
}

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  error: AuthError | null;
}

export interface AuthApi extends AuthState {
  /** Start a login. The user returns to `returnTo`, a local path. The default is the current path. */
  login: (returnTo?: string) => Promise<void>;
  /** Revoke the refresh token, clear all tabs of the application, and end the session at identity. */
  logout: () => Promise<void>;
  /** Start a new login with `prompt=login` and `max_age`. The default `maxAge` is 300 seconds. */
  stepUp: (maxAge?: number) => Promise<void>;
  /** Return the access token. It refreshes the token when less than 60 seconds of life stay. */
  getAccessToken: (options?: { forceRefresh?: boolean }) => Promise<string>;
}

/** The text for the user: the description, if any, and the error code. */
export function errorText(error: AuthError): string {
  return error.description ? `${error.description} (${error.code})` : error.code;
}
