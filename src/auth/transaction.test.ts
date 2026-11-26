import { beforeEach, describe, expect, it } from 'vitest';
import { purgeTransactions, safeReturnPath, saveTransaction, takeTransaction } from './transaction';

const entry = (createdAt: number) => ({
  codeVerifier: 'v'.repeat(43),
  nonce: 'n',
  returnTo: '/a',
  silent: false,
  createdAt,
});

beforeEach(() => window.sessionStorage.clear());

describe('return path', () => {
  // U3
  it('U3 keeps a local path and replaces any other value with /', () => {
    expect(safeReturnPath('/tickets/1?x=2')).toBe('/tickets/1?x=2');
    expect(safeReturnPath('//evil.example')).toBe('/');
    expect(safeReturnPath('/\\evil.example')).toBe('/');
    expect(safeReturnPath('https://evil.example')).toBe('/');
    expect(safeReturnPath('')).toBe('/');
    expect(safeReturnPath(null)).toBe('/');
    expect(safeReturnPath('/a\nb')).toBe('/');
  });
});

describe('transaction store', () => {
  // U6
  it('U6 deletes an entry that is older than 10 minutes at start', () => {
    const now = Date.now();
    saveTransaction('old', entry(now - 11 * 60 * 1000));
    saveTransaction('new', entry(now - 1000));
    purgeTransactions(now);
    expect(window.sessionStorage.getItem('constellation-auth:tx:old')).toBeNull();
    expect(window.sessionStorage.getItem('constellation-auth:tx:new')).not.toBeNull();
  });

  it('takes an entry one time and refuses an old entry', () => {
    const now = Date.now();
    saveTransaction('a', entry(now));
    expect(takeTransaction('a', now)?.returnTo).toBe('/a');
    expect(takeTransaction('a', now)).toBeNull();
    saveTransaction('b', entry(now - 11 * 60 * 1000));
    expect(takeTransaction('b', now)).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });
});
