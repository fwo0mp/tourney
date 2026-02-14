import { test as base, expect } from '@playwright/test';

import { startIsolatedBackend } from '../support/backend';

type E2EFixtures = {
  isolatedApiBaseUrl: string;
};

export const test = base.extend<E2EFixtures>({
  isolatedApiBaseUrl: [
    async ({}, use, testInfo) => {
      const backend = await startIsolatedBackend(testInfo);
      try {
        await use(backend.baseUrl);
      } finally {
        await backend.stop();
      }
    },
    { scope: 'test' },
  ],

  page: async ({ page, isolatedApiBaseUrl }, use) => {
    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      const currentUrl = new URL(request.url());
      const targetUrl = `${isolatedApiBaseUrl}${currentUrl.pathname}${currentUrl.search}`;
      const headers = { ...request.headers() };
      delete headers.host;

      const response = await route.fetch({
        url: targetUrl,
        method: request.method(),
        headers,
        postData: request.postDataBuffer() ?? undefined,
      });

      await route.fulfill({ response });
    });

    await use(page);
  },
});

export { expect };
