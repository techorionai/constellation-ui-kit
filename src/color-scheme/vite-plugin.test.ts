import type { ResolvedConfig, ViteDevServer } from 'vite';
import { constellationColorScheme } from './vite-plugin';

function paths(base: string): string[] {
  const plugin = constellationColorScheme();
  const configResolved = plugin.configResolved as (config: ResolvedConfig) => void;
  const configureServer = plugin.configureServer as (server: ViteDevServer) => void;
  configResolved({ base } as ResolvedConfig);
  const used: string[] = [];
  configureServer({
    middlewares: { use: (path: string) => used.push(path) },
  } as unknown as ViteDevServer);
  return used;
}

describe('constellationColorScheme', () => {
  it('serves the script at the root path for the base /', () => {
    expect(paths('/')).toEqual(['/color-scheme.js']);
  });

  it('serves the script under the base of the application', () => {
    expect(paths('/app')).toEqual(['/app/color-scheme.js']);
    expect(paths('/app/')).toEqual(['/app/color-scheme.js']);
  });
});
