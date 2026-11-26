// Login tests with a real identity service in containers and a real browser.
// The runner (run.mjs) starts the containers and the consumer app. See docs/development.md.
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const ISSUER = process.env.UI_KIT_ISSUER ?? '';
const EMAIL = process.env.UI_KIT_USER_EMAIL ?? '';
const PASSWORD = process.env.UI_KIT_USER_PASSWORD ?? '';
const APP_ORIGIN = `http://127.0.0.1:${process.env.UI_KIT_TEST_PORT ?? '4173'}`;

test.setTimeout(90_000);

/** The tokens that the browser got from the token endpoint. */
interface Captured {
  access: Set<string>;
  refresh: Set<string>;
  id: Set<string>;
  lastRefresh: string;
  tokenRequests: { grant: string | null }[];
}

function capture(page: Page): Captured {
  const captured: Captured = {
    access: new Set(),
    refresh: new Set(),
    id: new Set(),
    lastRefresh: '',
    tokenRequests: [],
  };
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/oauth/token' && request.method() === 'POST') {
      captured.tokenRequests.push({
        grant: new URLSearchParams(request.postData() ?? '').get('grant_type'),
      });
    }
  });
  page.on('response', (response) => {
    if (new URL(response.url()).pathname !== '/oauth/token' || response.status() !== 200) return;
    void response.json().then((body: Record<string, string>) => {
      if (body.access_token) captured.access.add(body.access_token);
      if (body.refresh_token) {
        captured.refresh.add(body.refresh_token);
        captured.lastRefresh = body.refresh_token;
      }
      if (body.id_token) captured.id.add(body.id_token);
    });
  });
  return captured;
}

async function fillLogin(page: Page) {
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
}

/** Log in through the consumer app and the hosted login of identity. */
async function login(page: Page, path = '/protected') {
  await page.goto(path);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`^${ISSUER}/login`));
  await fillLogin(page);
  await expect(page.getByTestId('user-email')).toHaveText(EMAIL);
}

function result(page: Page) {
  return page.getByTestId('result');
}

async function refreshToken(page: Page) {
  const response = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/oauth/token' && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Refresh token' }).click();
  expect((await response).status()).toBe(200);
}

async function secondTab(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto('/protected');
  await expect(page.getByTestId('user-email')).toHaveText(EMAIL);
  return page;
}

test.describe('login flow on identity', () => {
  // I1
  test('I1 logs in with the hosted login and comes back to the protected page', async ({
    page,
  }) => {
    await login(page);
    await expect(page).toHaveURL(`${APP_ORIGIN}/protected`);
    await expect(page.getByTestId('user-name')).not.toBeEmpty();
    expect(page.url()).not.toContain('code=');
    expect(page.url()).not.toContain('state=');
  });

  // I2
  test('I2 calls userinfo with the access token of the app audience', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Call userinfo' }).click();
    await expect(result(page)).toContainText('userinfo 200 sub=');
    await page.getByRole('button', { name: 'Show audience' }).click();
    await expect(result(page)).toContainText('aud=');
    await expect(result(page)).toContainText('identity');
  });

  // I3
  test('I3 refreshes the token with one refresh request and keeps the session', async ({
    page,
  }) => {
    const captured = capture(page);
    await login(page);
    const before = captured.tokenRequests.filter((r) => r.grant === 'refresh_token').length;
    await refreshToken(page);
    await expect(result(page)).toHaveText('refreshed');
    const after = captured.tokenRequests.filter((r) => r.grant === 'refresh_token').length;
    expect(after - before).toBe(1);
    await page.getByRole('button', { name: 'Call userinfo' }).click();
    await expect(result(page)).toContainText('userinfo 200');
  });

  // I4
  test('I4 logs in again after a reload with no login form', async ({ page }) => {
    await login(page);
    const authorize: string[] = [];
    const visited: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/oauth/authorize') authorize.push(url.searchParams.get('prompt') ?? '');
    });
    page.on('framenavigated', (frame) => visited.push(new URL(frame.url()).pathname));
    await page.reload();
    await expect(page.getByTestId('user-email')).toHaveText(EMAIL);
    expect(authorize).toEqual(['none']);
    expect(visited).not.toContain('/login');
  });

  // I5
  test('I5 keeps two tabs logged in with parallel refreshes', async ({ context, page }) => {
    await login(page);
    const tab2 = await secondTab(context);
    const loop = async (tab: Page) => {
      for (let i = 0; i < 3; i += 1) await refreshToken(tab);
    };
    await Promise.all([loop(page), loop(tab2)]);
    for (const tab of [page, tab2]) {
      await tab.getByRole('button', { name: 'Call userinfo' }).click();
      await expect(result(tab)).toContainText('userinfo 200');
    }
  });

  // I6
  test('I6 logs out in all tabs and revokes the refresh token', async ({ context, page }) => {
    const captured = capture(page);
    await login(page);
    const tab2 = await secondTab(context);
    await tab2.evaluate(() => {
      (window as unknown as { __marker: number }).__marker = 1;
    });
    const oldRefresh = captured.lastRefresh;
    expect(oldRefresh).not.toBe('');
    await page.getByRole('button', { name: 'User menu' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(page).toHaveURL(`${APP_ORIGIN}/`);
    // Tab 2 shows the login page with no reload.
    await expect(tab2.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
    expect(await tab2.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(
      1,
    );
    // The old refresh token does not work.
    const response = await fetch(`${ISSUER}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: oldRefresh,
        client_id: 'ui-kit-demo',
      }),
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe('invalid_grant');
    // A reload of tab 2 gives login_required, so it shows the login page.
    await tab2.reload();
    await expect(tab2.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
  });

  // I7
  test('I7 asks for the password again at step-up', async ({ page }) => {
    await login(page);
    const before = Number(
      (await page.getByTestId('user-auth-time').innerText()).replace('auth_time: ', ''),
    );
    expect(before).toBeGreaterThan(0);
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Step up' }).click();
    await expect(page).toHaveURL(new RegExp(`^${ISSUER}/login`));
    await fillLogin(page);
    await expect(page).toHaveURL(`${APP_ORIGIN}/protected`);
    await expect(page.getByTestId('user-email')).toHaveText(EMAIL);
    const after = Number(
      (await page.getByTestId('user-auth-time').innerText()).replace('auth_time: ', ''),
    );
    expect(after).toBeGreaterThan(before);
  });

  // I8
  test('I8 shows the error view for a callback with an unknown state', async ({ page }) => {
    const tokenRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/oauth/token') tokenRequests.push(request.url());
    });
    await page.goto('/auth/callback?code=x&state=unknown');
    await expect(page.getByRole('alert')).toContainText('invalid_state');
    expect(tokenRequests).toEqual([]);
  });

  // I9
  test('I9 goes to / for a return path that is not local', async ({ page }) => {
    await page.goto(`/?returnTo=${encodeURIComponent('//evil.example/x')}`);
    await page.getByRole('button', { name: 'Log in with return path' }).click();
    await expect(page).toHaveURL(new RegExp(`^${ISSUER}/login`));
    await fillLogin(page);
    await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible();
    expect(new URL(page.url()).origin).toBe(APP_ORIGIN);
    expect(new URL(page.url()).pathname).toBe('/');
  });

  // I11
  test('I11 shows invalid_scope and a Try again button for a scope the app does not have', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('demo-scopes', 'demo:item:read');
    });
    await page.goto('/protected');
    // The silent request fails with any error, so the page shows LoginPage first.
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('alert')).toContainText('invalid_scope');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  // I12
  test('I12 sends tokens only to the allowed endpoints, keeps them out of storage, and has no CSP violation', async ({
    context,
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __csp: string[] };
      w.__csp = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        w.__csp.push(`${event.violatedDirective} ${event.blockedURI}`);
      });
    });
    const captured = capture(page);
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    const requests: { url: string; auth: string | undefined; body: string }[] = [];
    page.on('request', (request) => {
      requests.push({
        url: request.url(),
        auth: request.headers()['authorization'],
        body: request.postData() ?? '',
      });
    });

    await login(page);
    await page.getByRole('button', { name: 'Call userinfo' }).click();
    await expect(result(page)).toContainText('userinfo 200');
    await refreshToken(page);
    await page.getByRole('button', { name: 'Call userinfo' }).click();
    await expect(result(page)).toContainText('userinfo 200');
    await page.getByRole('button', { name: 'Step up' }).click();
    await fillLogin(page);
    await expect(page.getByTestId('user-email')).toHaveText(EMAIL);
    await page.waitForTimeout(500);

    expect(captured.access.size).toBeGreaterThan(1);
    const secrets = [...captured.access, ...captured.refresh];
    const allowed = [`${ISSUER}/oauth/token`, `${ISSUER}/oauth/revoke`, `${ISSUER}/oauth/userinfo`];
    for (const request of requests) {
      const carriesSecret =
        request.auth !== undefined ||
        secrets.some((secret) => request.url.includes(secret) || request.body.includes(secret));
      if (!carriesSecret) continue;
      const target = request.url.split('?')[0]!;
      expect(allowed, `A request to ${target} has a token`).toContain(target);
      expect(request.url.startsWith(APP_ORIGIN)).toBe(false);
    }
    expect(requests.some((r) => r.auth !== undefined && r.url.endsWith('/oauth/userinfo'))).toBe(
      true,
    );

    // No token in the storage of the app origin.
    const stored = await page.evaluate(() =>
      JSON.stringify({
        local: { ...window.localStorage },
        session: { ...window.sessionStorage },
        cookie: document.cookie,
      }),
    );
    const cookies = JSON.stringify(await context.cookies(APP_ORIGIN));
    for (const secret of [...secrets, ...captured.id]) {
      expect(stored).not.toContain(secret);
      expect(cookies).not.toContain(secret);
    }
    const databases = await page.evaluate(async () => {
      const list = await (indexedDB.databases?.() ?? Promise.resolve([]));
      return list.map((db) => db.name);
    });
    expect(databases).toEqual([]);

    const violations = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
    expect(violations).toEqual([]);
    expect(errors).toEqual([]);
  });
});
