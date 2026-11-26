import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { constellationColorScheme } from '@techorionai/constellation-ui-kit/vite';

export default defineConfig(({ mode }) => {
  // With VITE_ISSUER the app uses the login flow, so the CSP allows the issuer for connect-src.
  const issuer = loadEnv(mode, process.cwd(), 'VITE_').VITE_ISSUER;
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    issuer ? `connect-src 'self' ${issuer}` : null,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ]
    .filter(Boolean)
    .join('; ');
  return {
    plugins: [react(), constellationColorScheme()],
    preview: { headers: { 'Content-Security-Policy': csp } },
  };
});
