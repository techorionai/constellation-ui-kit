import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { constellationColorScheme } from './vite-plugin';

const script = readFileSync(join(import.meta.dirname, 'color-scheme.js'), 'utf8');

function setMatchMedia(dark: boolean) {
  window.matchMedia = ((query: string) => ({ matches: dark, media: query })) as never;
}

function run() {
  document.documentElement.removeAttribute('data-mantine-color-scheme');
  new Function(script)();
  return document.documentElement.getAttribute('data-mantine-color-scheme');
}

describe('color scheme script', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  // U22
  it('U22 uses the stored value dark', () => {
    setMatchMedia(false);
    window.localStorage.setItem('mantine-color-scheme-value', 'dark');
    expect(run()).toBe('dark');
  });

  it('U22 resolves auto with a dark matchMedia', () => {
    setMatchMedia(true);
    window.localStorage.setItem('mantine-color-scheme-value', 'auto');
    expect(run()).toBe('dark');
  });

  it('U22 does not throw when localStorage throws', () => {
    setMatchMedia(true);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(run()).toBe('dark');
  });
});

describe('constellationColorScheme', () => {
  // U23
  it('U23 adds one script tag with src, first in head, with no inline code', () => {
    const plugin = constellationColorScheme();
    const hook = plugin.transformIndexHtml as { handler: (html: string) => unknown[] };
    const tags = hook.handler('<html><head></head></html>') as {
      tag: string;
      attrs: Record<string, string | boolean>;
      children?: unknown;
      injectTo: string;
    }[];
    expect(tags).toHaveLength(1);
    const tag = tags[0]!;
    expect(tag.tag).toBe('script');
    expect(tag.injectTo).toBe('head-prepend');
    expect(tag.attrs.src).toMatch(/color-scheme\.js$/);
    expect(tag.attrs.defer).toBeUndefined();
    expect(tag.attrs.async).toBeUndefined();
    expect(tag.attrs.type).toBeUndefined();
    expect(tag.children).toBeUndefined();
  });
});
