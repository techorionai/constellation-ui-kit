import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCallback } from './client';
import { callbackUrl, loginFully, makeConfig, makeHarness, startLogin } from '../test/auth';

beforeEach(() => window.sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('secrets', () => {
  // U16
  it('U16 writes no token, code, code_verifier, or state to the console or to an error', async () => {
    const calls: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        calls.push(args.map((arg) => String(arg)).join(' '));
      });
    }
    const secrets = new Set<string>(['code-1', 'SECRET-TOKEN-1', 'SECRET-TOKEN-2', 'refresh-1']);
    const errors: string[] = [];
    const record = (error: unknown) => {
      if (error instanceof Error)
        errors.push(`${error.name} ${error.message} ${String(error.cause)}`);
    };

    // A full flow: login, refresh, step-up, and logout.
    const h = makeHarness({ tokenPrefix: 'SECRET-TOKEN' });
    const { state, url } = await startLogin(h);
    secrets.add(state);
    secrets.add(url.searchParams.get('nonce')!);
    const tx = JSON.parse(window.sessionStorage.getItem(`constellation-auth:tx:${state}`)!);
    secrets.add(tx.codeVerifier);
    await h.controller.completeCallback(callbackUrl(state));
    await h.controller.getAccessToken({ forceRefresh: true }).catch(record);
    await h.controller.stepUp(60).catch(record);
    await h.controller.logout().catch(record);

    // The error paths.
    const bad = makeHarness({ tokenPrefix: 'SECRET-TOKEN' });
    bad.identity.idTokenIss = 'https://evil.example';
    const second = await startLogin(bad);
    secrets.add(second.state);
    const wrongIss = await handleCallback(makeConfig(), callbackUrl(second.state, 'code-1'));
    if (!wrongIss.ok) record(wrongIss.error);
    const unknown = await handleCallback(makeConfig(), callbackUrl('unknown-state'));
    if (!unknown.ok) record(unknown.error);
    const grant = makeHarness({ tokenPrefix: 'SECRET-TOKEN' });
    await loginFully(grant);
    grant.identity.refreshError = 'invalid_grant';
    await grant.controller.getAccessToken({ forceRefresh: true }).catch(record);

    const output = [...calls, ...errors].join('\n');
    for (const secret of secrets) {
      expect(output).not.toContain(secret);
    }
    vi.restoreAllMocks();
  });

  it('U16 has no console call in the source of the login code', () => {
    const files = readdirSync(import.meta.dirname).filter(
      (name) => /\.(ts|tsx)$/.test(name) && !name.includes('.test.'),
    );
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const source = readFileSync(join(import.meta.dirname, file), 'utf8');
      expect(source, file).not.toMatch(/\bconsole\./);
    }
  });
});
