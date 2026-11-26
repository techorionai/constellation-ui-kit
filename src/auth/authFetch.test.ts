import { describe, expect, it, vi } from 'vitest';
import { createAuthFetch } from './authFetch';

function setup(responses: Response[]) {
  const getAccessToken = vi.fn(async (options?: { forceRefresh?: boolean }) =>
    options?.forceRefresh ? 'token-2' : 'token-1',
  );
  const sent: Request[] = [];
  const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(new Request(input, init));
    return responses.shift() ?? new Response(null, { status: 200 });
  }) as unknown as typeof fetch;
  const authFetch = createAuthFetch(
    { getAccessToken },
    { fetch: fakeFetch, allowedOrigins: ['http://localhost:8080'] },
  );
  return { authFetch, getAccessToken, sent };
}

describe('createAuthFetch', () => {
  // U9
  it('U9 rejects with AuthError for a step-up 401 and does not refresh', async () => {
    const { authFetch, getAccessToken, sent } = setup([
      new Response(null, {
        status: 401,
        headers: {
          'WWW-Authenticate':
            'Bearer error="insufficient_user_authentication", error_description="x", max_age="300"',
        },
      }),
    ]);
    await expect(authFetch('/v1/things')).rejects.toMatchObject({
      name: 'AuthError',
      code: 'insufficient_user_authentication',
      maxAge: 300,
    });
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(getAccessToken).toHaveBeenCalledWith({ forceRefresh: false });
    expect(sent).toHaveLength(1);
  });

  it('uses the max_age value of the header', async () => {
    const { authFetch } = setup([
      new Response(null, {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Bearer error="insufficient_user_authentication", max_age="60"',
        },
      }),
    ]);
    await expect(authFetch('/v1/things')).rejects.toMatchObject({ maxAge: 60 });
  });

  // U10
  it('U10 refreshes one time and sends the request again one time', async () => {
    const { authFetch, getAccessToken, sent } = setup([
      new Response(null, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }),
      new Response('ok', { status: 200 }),
    ]);
    const response = await authFetch('/v1/things', { method: 'POST', body: 'data' });
    expect(response.status).toBe(200);
    expect(getAccessToken).toHaveBeenNthCalledWith(2, { forceRefresh: true });
    expect(sent).toHaveLength(2);
    expect(sent[0]!.headers.get('Authorization')).toBe('Bearer token-1');
    expect(sent[1]!.headers.get('Authorization')).toBe('Bearer token-2');
    expect(await sent[1]!.text()).toBe('data');
  });

  it('U10 returns the second 401 to the caller', async () => {
    const { authFetch, sent } = setup([
      new Response(null, { status: 401 }),
      new Response(null, { status: 401 }),
    ]);
    const response = await authFetch('/v1/things');
    expect(response.status).toBe(401);
    expect(sent).toHaveLength(2);
  });

  // U11
  it('U11 sends no token to an origin that is not allowed', async () => {
    const { authFetch, getAccessToken, sent } = setup([]);
    await authFetch('https://other.example/api');
    expect(sent[0]!.headers.get('Authorization')).toBeNull();
    expect(getAccessToken).not.toHaveBeenCalled();
    await authFetch('http://localhost:8080/oauth/userinfo');
    expect(sent[1]!.headers.get('Authorization')).toBe('Bearer token-1');
    await authFetch(`${window.location.origin}/v1/x`);
    expect(sent[2]!.headers.get('Authorization')).toBe('Bearer token-1');
  });
});

describe('createAuthFetch with other inputs', () => {
  // R8
  it('R8 adds the token to a Request input', async () => {
    const { authFetch, sent } = setup([]);
    await authFetch(new Request(`${window.location.origin}/v1/things`, { method: 'DELETE' }));
    expect(sent[0]!.method).toBe('DELETE');
    expect(sent[0]!.headers.get('Authorization')).toBe('Bearer token-1');
  });

  // R8
  it('R8 sends the body again with the new token after a 401', async () => {
    const { authFetch, sent } = setup([new Response(null, { status: 401 })]);
    const response = await authFetch('/v1/things', { method: 'POST', body: '{"a":1}' });
    expect(response.status).toBe(200);
    expect(sent).toHaveLength(2);
    expect(await sent[0]!.text()).toBe('{"a":1}');
    expect(await sent[1]!.text()).toBe('{"a":1}');
    expect(sent[1]!.headers.get('Authorization')).toBe('Bearer token-2');
  });
});
