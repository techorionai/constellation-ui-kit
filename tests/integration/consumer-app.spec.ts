import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ORIGIN = `http://127.0.0.1:${process.env.UI_KIT_TEST_PORT ?? '4173'}`;

async function collectCspViolations(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as { __csp: string[] }).__csp.push(
        `${event.violatedDirective} ${event.blockedURI}`,
      );
    });
  });
}

async function setScheme(page: Page, scheme: 'light' | 'dark') {
  await page.addInitScript((value) => {
    window.localStorage.setItem('mantine-color-scheme-value', value);
  }, scheme);
}

test.describe('consumer app', () => {
  // I3
  test('I3 renders the layout, the header, and the links with no console error', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Tickets' })).toBeVisible();
    await expect(page.getByText('Consumer app')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tickets' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Users' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  // I4
  test('I4 keeps the color scheme after a reload, before React renders', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-mantine-color-scheme', 'light');
    await page.getByRole('button', { name: /switch to dark/i }).click();
    await expect(html).toHaveAttribute('data-mantine-color-scheme', 'dark');
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        (window as unknown as { __scheme: string | null }).__scheme =
          document.documentElement.getAttribute('data-mantine-color-scheme');
      });
    });
    await page.reload();
    const atDomReady = await page.evaluate(
      () => (window as unknown as { __scheme: string | null }).__scheme,
    );
    expect(atDomReady).toBe('dark');
  });

  // I5
  test('I5 sends all requests to the origin of the app', async ({ page }) => {
    const hosts = new Set<string>();
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.protocol === 'http:' || url.protocol === 'https:') hosts.add(url.origin);
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect([...hosts]).toEqual([ORIGIN]);
  });

  // I6
  test('I6 has zero CSP violations and sends the CSP header', async ({ page }) => {
    await collectCspViolations(page);
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const response = await page.goto('/');
    const csp = response?.headers()['content-security-policy'] ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'unsafe-inline'");
    expect(csp).not.toContain('unsafe-eval');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const violations = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
    expect(violations).toEqual([]);
    expect(errors).toEqual([]);
  });

  // I8
  for (const scheme of ['light', 'dark'] as const) {
    test(`I8 has no accessibility violation in the ${scheme} scheme`, async ({ page }) => {
      await setScheme(page, scheme);
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', scheme);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
      expect(results.violations).toEqual([]);
      const all = await new AxeBuilder({ page }).analyze();
      expect(all.violations).toEqual([]);
    });
  }

  // I9
  test('I9 opens the navbar with the burger button on a small screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/');
    const link = page.getByRole('link', { name: 'Users' });
    await expect(link).not.toBeInViewport();
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await expect(link).toBeInViewport();
    await link.click();
    await expect(page).toHaveURL(/#users$/);
  });
});
