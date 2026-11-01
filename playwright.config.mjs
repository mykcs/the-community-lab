import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4321/the-community-lab/';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    screenshot: 'off',
    trace: 'off',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
    {
      // A responsive browser simulation, not a claim of physical-device testing.
      name: 'iphone-18-pro-max-440x956',
      use: {
        browserName: 'chromium',
        viewport: { width: 440, height: 956 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4321',
    url: `${baseURL}questionnaire/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { COMMUNITY_DEPLOY_TARGET: 'github-pages' },
  },
});
