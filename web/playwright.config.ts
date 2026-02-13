import { defineConfig } from '@playwright/test';

const webPort = Number(process.env.E2E_WEB_PORT ?? 4173);

export default defineConfig({
  testDir: './e2e/generated',
  fullyParallel: true,
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `BACKEND_PORT=8999 npm run dev -- --host 127.0.0.1 --port ${webPort}`,
    url: `http://127.0.0.1:${webPort}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
