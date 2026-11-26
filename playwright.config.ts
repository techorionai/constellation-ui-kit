import { defineConfig } from '@playwright/test';

const port = process.env.UI_KIT_TEST_PORT ?? '4173';

export default defineConfig({
  testDir: 'tests/integration',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: 'chromium' },
});
