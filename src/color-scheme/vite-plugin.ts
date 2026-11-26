import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HtmlTagDescriptor, Plugin } from 'vite';

const FILE_NAME = 'color-scheme.js';

function readScript(): string {
  return readFileSync(join(import.meta.dirname, FILE_NAME), 'utf8');
}

/**
 * Vite plugin. It emits the color scheme script as a build asset and adds a
 * `<script src>` tag as the first element of `head`. The script has no inline code,
 * so the page needs no `script-src 'unsafe-inline'`.
 */
export function constellationColorScheme(): Plugin {
  let base = '/';
  return {
    name: 'constellation-color-scheme',
    configResolved(config) {
      base = config.base.endsWith('/') ? config.base : `${config.base}/`;
    },
    configureServer(server) {
      server.middlewares.use(`/${FILE_NAME}`, (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(readScript());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: FILE_NAME, source: readScript() });
    },
    transformIndexHtml: {
      order: 'post',
      handler(): HtmlTagDescriptor[] {
        return [
          {
            tag: 'script',
            attrs: { src: `${base}${FILE_NAME}` },
            injectTo: 'head-prepend',
          },
        ];
      },
    },
  };
}
