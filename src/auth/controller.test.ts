import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError } from './types';
import { callbackUrl, loginFully, makeHarness, startLogin, type Harness } from '../test/auth';

class FakeChannel {
  static instances: FakeChannel[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  posted: unknown[] = [];
  closed = false;
  constructor(public name: string) {
    FakeChannel.instances.push(this);
  }
  postMessage(message: unknown) {
    this.posted.push(message);
  }
  close() {
    this.closed = true;
  }
  receive(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

const beacon = vi.fn(() => true);

beforeEach(() => {
  window.sessionStorage.clear();
  FakeChannel.instances = [];
  beacon.mockClear();
  vi.stubGlobal('BroadcastChannel', FakeChannel);
  Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
  window.history.replaceState({}, '', '/tickets/1?x=2');
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

/** Start the controller on the callback path, so that it makes no silent request. */
function startOnCallbackPath(h: Harness) {
  window.history.replaceState({}, '', '/auth/callback');
  return h.controller.start();
}

describe('refresh', () => {
  // U7
  it('U7 sends one refresh request for two calls at the same time', async () => {
    const h = makeHarness({ expiresIn: 30 });
    await loginFully(h);
    const [a, b] = await Promise.all([
      h.controller.getAccessToken(),
      h.controller.getAccessToken(),
    ]);
    expect(h.identity.tokenRequests('refresh_token')).toHaveLength(1);
    expect(a).toBe(b);
    expect(a).toBe('access-2');
    expect(h.identity.tokenRequests('refresh_token')[0]!.body.get('refresh_token')).toBe(
      'refresh-1',
    );
  });

  it('does not refresh a token that has more than 60 seconds of life', async () => {
    const h = makeHarness();
    await loginFully(h);
    expect(await h.controller.getAccessToken()).toBe('access-1');
    expect(h.identity.tokenRequests('refresh_token')).toHaveLength(0);
    expect(await h.controller.getAccessToken({ forceRefresh: true })).toBe('access-2');
  });

  // U8
  it('U8 clears the tokens and starts a login for invalid_grant', async () => {
    const h = makeHarness();
    await loginFully(h);
    h.redirects.length = 0;
    h.identity.refreshError = 'invalid_grant';
    await expect(h.controller.getAccessToken({ forceRefresh: true })).rejects.toMatchObject({
      code: 'invalid_grant',
    });
    expect(h.controller.getSnapshot().status).toBe('unauthenticated');
    await expect(h.controller.getAccessToken()).rejects.toMatchObject({ code: 'login_required' });
    expect(h.redirects).toHaveLength(1);
    const url = new URL(h.redirects[0]!);
    expect(url.pathname).toBe('/oauth/authorize');
    expect(url.searchParams.get('prompt')).toBeNull();
    const stored = JSON.parse(
      window.sessionStorage.getItem(`constellation-auth:tx:${url.searchParams.get('state')}`)!,
    );
    expect(stored.returnTo).toBe('/tickets/1?x=2');
  });
});

describe('logout', () => {
  // U14
  it('U14 revokes, broadcasts, and goes to the end session URL', async () => {
    const h = makeHarness();
    startOnCallbackPath(h);
    await loginFully(h);
    h.redirects.length = 0;
    const order: string[] = [];
    h.identity.onRevoke = () => order.push('revoke');
    FakeChannel.instances[0]!.postMessage = (message: unknown) => {
      order.push(`broadcast:${(message as { type: string }).type}`);
    };
    await h.controller.logout();
    expect(order).toEqual(['revoke', 'broadcast:logout']);
    const revoke = h.identity.requests.find((r) => r.url.endsWith('/oauth/revoke'))!;
    expect(revoke.body.get('token')).toBe('refresh-1');
    expect(revoke.body.get('client_id')).toBe('demo-ui');
    expect(FakeChannel.instances[0]!.name).toBe('constellation-auth:demo-ui');
    const end = new URL(h.redirects[0]!);
    expect(end.pathname).toBe('/oauth/end_session');
    expect(end.searchParams.get('id_token_hint')).toBeTruthy();
    expect(end.searchParams.get('post_logout_redirect_uri')).toBe(`${window.location.origin}/`);
    expect(end.searchParams.get('client_id')).toBe('demo-ui');
  });

  // U15
  it('U15 clears the tokens when another tab logs out, with no revoke', async () => {
    const h = makeHarness();
    startOnCallbackPath(h);
    await loginFully(h);
    expect(h.controller.getSnapshot().status).toBe('authenticated');
    FakeChannel.instances[0]!.receive({ type: 'logout' });
    expect(h.controller.getSnapshot().status).toBe('unauthenticated');
    await expect(h.controller.getAccessToken()).rejects.toBeInstanceOf(AuthError);
    expect(h.identity.requests.some((r) => r.url.endsWith('/oauth/revoke'))).toBe(false);
  });
});

describe('step-up', () => {
  // U18
  it('U18 revokes the refresh token, then starts a request with prompt=login and max_age', async () => {
    const h = makeHarness();
    await loginFully(h);
    h.redirects.length = 0;
    const order: string[] = [];
    h.identity.onRevoke = () => order.push('revoke');
    await h.controller.stepUp(120);
    expect(order).toEqual(['revoke']);
    const revoke = h.identity.requests.find((r) => r.url.endsWith('/oauth/revoke'))!;
    expect(revoke.body.get('token')).toBe('refresh-1');
    const url = new URL(h.redirects[0]!);
    expect(url.searchParams.get('prompt')).toBe('login');
    expect(url.searchParams.get('max_age')).toBe('120');
    const stored = JSON.parse(
      window.sessionStorage.getItem(`constellation-auth:tx:${url.searchParams.get('state')}`)!,
    );
    expect(stored.returnTo).toBe('/tickets/1?x=2');
    expect(stored.maxAge).toBe(120);
  });

  it('checks auth_time against max_age in the callback', async () => {
    const h = makeHarness();
    await loginFully(h);
    h.redirects.length = 0;
    await h.controller.stepUp(120);
    const fresh = makeHarness();
    const state = new URL(h.redirects[0]!).searchParams.get('state')!;
    fresh.identity.nonce = new URL(h.redirects[0]!).searchParams.get('nonce')!;
    const outcome = await fresh.controller.completeCallback(callbackUrl(state));
    expect(outcome.kind).toBe('success');
  });
});

describe('page hide', () => {
  // U21
  it('U21 sends one beacon for pagehide with persisted false and none for true', async () => {
    const h = makeHarness();
    const stop = startOnCallbackPath(h);
    await loginFully(h);
    const hide = (persisted: boolean) => {
      const event = new Event('pagehide');
      Object.defineProperty(event, 'persisted', { value: persisted });
      window.dispatchEvent(event);
    };
    hide(false);
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, body] = beacon.mock.calls[0] as unknown as [string, URLSearchParams];
    expect(url).toBe('http://localhost:8080/oauth/revoke');
    expect(body.get('token')).toBe('refresh-1');
    beacon.mockClear();
    hide(true);
    expect(beacon).not.toHaveBeenCalled();
    stop();
  });
});

describe('silent login', () => {
  it('starts one silent request for each page load, also after a double start', async () => {
    const h = makeHarness();
    const stop = h.controller.start();
    stop();
    h.controller.start();
    await vi.waitFor(() => expect(h.redirects).toHaveLength(1));
    expect(new URL(h.redirects[0]!).searchParams.get('prompt')).toBe('none');
    const { state } = await startLogin(h);
    expect(state).toBeTruthy();
  });

  it('makes no silent request on the callback path', () => {
    const h = makeHarness();
    startOnCallbackPath(h);
    expect(h.redirects).toEqual([]);
    expect(h.controller.getSnapshot().status).toBe('loading');
  });
});
