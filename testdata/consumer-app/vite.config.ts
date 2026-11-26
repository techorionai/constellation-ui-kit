import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { constellationColorScheme } from '@techorionai/constellation-ui-kit/vite';

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

export default defineConfig({
  plugins: [react(), constellationColorScheme()],
  preview: { headers: { 'Content-Security-Policy': csp } },
});
