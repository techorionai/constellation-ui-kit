// Data of one authorization request. It lives in sessionStorage only from the redirect
// to identity until the callback. It has no token. The code verifier has no use after
// the code exchange.

const PREFIX = 'constellation-auth:tx:';
const MAX_AGE_MS = 10 * 60 * 1000;

export interface Transaction {
  codeVerifier: string;
  nonce: string;
  returnTo: string;
  /** The request has `prompt=none`. */
  silent: boolean;
  /** Seconds. Set for a step-up request. */
  maxAge?: number;
  createdAt: number;
}

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Return the path if it is a local path. Any other value becomes `/`. */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/')) return '/';
  if (value.startsWith('//') || value.startsWith('/\\')) return '/';
  // A control character can change how a browser reads the path.
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return '/';
  }
  return value;
}

export function saveTransaction(state: string, transaction: Transaction): void {
  const store = storage();
  if (!store) throw new Error('sessionStorage is not available');
  store.setItem(PREFIX + state, JSON.stringify(transaction));
}

/** Read and delete the entry for a state. Return null if there is none or if it is too old. */
export function takeTransaction(state: string, now = Date.now()): Transaction | null {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(PREFIX + state);
  store.removeItem(PREFIX + state);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Transaction;
    if (typeof value.createdAt !== 'number' || now - value.createdAt > MAX_AGE_MS) return null;
    if (typeof value.codeVerifier !== 'string' || typeof value.nonce !== 'string') return null;
    return { ...value, returnTo: safeReturnPath(value.returnTo) };
  } catch {
    return null;
  }
}

/** Delete the entries that are older than 10 minutes. */
export function purgeTransactions(now = Date.now()): void {
  const store = storage();
  if (!store) return;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  for (const key of keys) {
    try {
      const value = JSON.parse(store.getItem(key) ?? '') as Partial<Transaction>;
      if (typeof value.createdAt === 'number' && now - value.createdAt <= MAX_AGE_MS) continue;
    } catch {
      // An entry that is not valid JSON is deleted.
    }
    store.removeItem(key);
  }
}
