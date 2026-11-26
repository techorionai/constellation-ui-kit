import { describe, expect, it } from 'vitest';
import { base32Decode, totp } from './totp.mjs';

// The test vectors of RFC 6238 appendix B for SHA-1. The key is the ASCII text
// "12345678901234567890". The RFC lists 8-digit codes, so the 6-digit code is the last 6 digits.
const key = Buffer.from('12345678901234567890');
const vectors = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('totp', () => {
  // U23
  for (const [time, expected] of vectors) {
    it(`U23 gives the code for time ${time}`, () => {
      expect(totp(key, time)).toBe(expected.slice(-6));
      expect(totp(key, time, 8)).toBe(expected);
    });
  }

  it('decodes a base32 secret', () => {
    expect(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ').toString()).toBe(
      '12345678901234567890',
    );
    expect(base32Decode('gezd gnbv-gy3t qojq gezd gnbv gy3t qojq==').toString()).toBe(
      '12345678901234567890',
    );
  });
});
