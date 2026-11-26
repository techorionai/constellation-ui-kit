import '@testing-library/jest-dom/vitest';
import { expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';

expect.extend(axeMatchers);

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub;
(window.HTMLElement.prototype as { scrollIntoView?: () => void }).scrollIntoView = () => {};

// jsdom has its own ArrayBuffer class. The digest of Node.js returns an ArrayBuffer of the other
// class, so `instanceof ArrayBuffer` in oauth4webapi fails. Copy the result into a jsdom buffer.
const subtle = globalThis.crypto.subtle;
const digest = subtle.digest.bind(subtle);
subtle.digest = async (...args: Parameters<SubtleCrypto['digest']>) => {
  const result = new Uint8Array(await digest(...args));
  const copy = new ArrayBuffer(result.byteLength);
  new Uint8Array(copy).set(result);
  return copy;
};
