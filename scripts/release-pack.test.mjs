import { describe, expect, it } from 'vitest';
import { checkTag, versionFromTag } from './release-pack.mjs';

describe('release-pack tag check', () => {
  // U24
  it('U24 accepts vX.Y.Z and vX.Y.Z-rc.N and rejects other tags', () => {
    expect(checkTag('v0.1.0')).toBe(true);
    expect(checkTag('v0.0.1-rc.1')).toBe(true);
    expect(checkTag('1.0')).toBe(false);
    expect(checkTag('v1.0')).toBe(false);
    expect(checkTag('v0.1.0-beta')).toBe(false);
  });

  it('returns the version without the v', () => {
    expect(versionFromTag('v0.1.0')).toBe('0.1.0');
    expect(versionFromTag('v0.0.1-rc.1')).toBe('0.0.1-rc.1');
    expect(versionFromTag(undefined)).toBeNull();
  });
});
