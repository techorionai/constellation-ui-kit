import { AuthError, type AuthApi } from './types';

export interface AuthFetchOptions {
  /** Origins that get the access token besides the origin of the application. */
  allowedOrigins?: string[];
  /** The `fetch` function to use. The default is the global `fetch`. */
  fetch?: typeof fetch;
}

const DEFAULT_MAX_AGE = 300;

/** Read `error` and `max_age` from a `WWW-Authenticate: Bearer` header. */
function stepUpChallenge(response: Response): { maxAge: number } | null {
  const header = response.headers.get('WWW-Authenticate');
  if (!header) return null;
  const error = /\berror="([^"]*)"/i.exec(header)?.[1];
  if (error !== 'insufficient_user_authentication') return null;
  const maxAge = Number(/\bmax_age="?(\d+)"?/i.exec(header)?.[1]);
  return { maxAge: Number.isFinite(maxAge) && maxAge > 0 ? maxAge : DEFAULT_MAX_AGE };
}

/**
 * Return a `fetch` function that adds `Authorization: Bearer <access token>`.
 * It sends the token only to the origin of the application and to `allowedOrigins`.
 * A 401 refreshes the token one time and sends the request again one time.
 * A step-up 401 rejects with `AuthError` `insufficient_user_authentication`.
 */
export function createAuthFetch(
  auth: Pick<AuthApi, 'getAccessToken'>,
  options: AuthFetchOptions = {},
): typeof fetch {
  const allowed = new Set([window.location.origin, ...(options.allowedOrigins ?? [])]);
  return async (input, init) => {
    const send = options.fetch ?? fetch;
    // A relative URL needs a base in Node.js. A browser uses the address of the page.
    const target =
      input instanceof Request ? input : new URL(String(input), window.location.href).href;
    const request = new Request(target, init);
    if (!allowed.has(new URL(request.url).origin)) return send(request);

    const attempt = async (forceRefresh: boolean, message: Request) => {
      const token = await auth.getAccessToken({ forceRefresh });
      message.headers.set('Authorization', `Bearer ${token}`);
      return send(message);
    };
    const retry = request.clone();
    const first = await attempt(false, request);
    if (first.status !== 401) return first;
    const challenge = stepUpChallenge(first);
    if (challenge) {
      throw new AuthError('insufficient_user_authentication', { maxAge: challenge.maxAge });
    }
    return attempt(true, retry);
  };
}
