// Login test with MFA for admins (login plan I10). The runner starts a second identity
// container set with IDENTITY_MFA__REQUIRE_FOR_ADMINS=true. See docs/development.md.
import { expect, test } from '@playwright/test';
// @ts-expect-error The helper is a JavaScript module with no type file.
import { base32Decode, totp } from './totp.mjs';

const ISSUER = process.env.UI_KIT_ISSUER ?? '';
const SETUP_LINK = process.env.UI_KIT_SETUP_LINK ?? '';
const EMAIL = process.env.UI_KIT_USER_EMAIL ?? '';
const NAME = process.env.UI_KIT_USER_NAME ?? '';
const PASSWORD = process.env.UI_KIT_USER_PASSWORD ?? '';

test.setTimeout(150_000);

/** Wait for the next 30 second step, so that identity does not see one code two times. */
async function waitForNextStep() {
  const step = Math.floor(Date.now() / 30_000);
  while (Math.floor(Date.now() / 30_000) === step) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

test('I10 asks for the TOTP code and gives amr with mfa', async ({ browser }) => {
  // Make the first admin and set up TOTP in a first browser context.
  const setup = await browser.newContext();
  const setupPage = await setup.newPage();
  await setupPage.goto(SETUP_LINK);
  await setupPage.getByLabel('Email').fill(EMAIL);
  await setupPage.getByLabel('Name').fill(NAME);
  await setupPage.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await setupPage.getByLabel('Password again').fill(PASSWORD);
  await setupPage.getByRole('button', { name: 'Make account' }).click();
  await expect(setupPage).toHaveURL(new RegExp(`^${ISSUER}/account/totp`));
  const secret = (await setupPage.locator('code').first().innerText()).trim();
  const key = base32Decode(secret);
  await setupPage.getByLabel('Code from the app').fill(totp(key));
  await setupPage.getByRole('button', { name: 'Turn on TOTP' }).click();
  // The page with the recovery codes shows that TOTP is on.
  await expect(setupPage.getByRole('heading', { name: /recovery/i })).toBeVisible();
  await setup.close();

  // A new context has no identity session. This is the same as a logout of identity.
  await waitForNextStep();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/protected');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  // The login asks for the code on the page of identity.
  await expect(page).toHaveURL(new RegExp(`^${ISSUER}/login/mfa`));
  await page.getByLabel('Code').fill(totp(key));
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByTestId('user-email')).toHaveText(EMAIL);
  await expect(page.getByTestId('user-amr')).toContainText('mfa');
  await context.close();
});
