import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

const external = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  /^@mantine\//,
  'vite',
  /^node:/,
];

export default defineConfig({
  plugins: [
    react(),
    dts({ include: ['src'], exclude: ['src/**/*.test.*', 'src/test/**'], entryRoot: 'src' }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        vite: resolve(import.meta.dirname, 'src/vite.ts'),
        'color-scheme': resolve(import.meta.dirname, 'src/color-scheme/color-scheme.js'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external,
      output: {
        entryFileNames: '[name].js',
        assetFileNames: (asset) =>
          asset.names.some((name) => name.endsWith('.css')) ? 'styles.css' : '[name][extname]',
      },
    },
    copyPublicDir: false,
  },
});
