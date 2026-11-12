import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5174', channel: 'chrome', headless: true, screenshot: 'only-on-failure' },
  webServer: { command:'node scripts/start-e2e.mjs',url:'http://127.0.0.1:5174',reuseExistingServer:process.env.INTIMO_REUSE_TEST_SERVER === 'true',timeout:30000 }
});
