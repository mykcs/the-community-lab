import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4321/the-community-lab/';
const previewCommand = 'npm run preview -- --host 127.0.0.1 --port 4321';
// CI already built the exact PR head with GitHub Pages paths. Locally, an
// ordinary Astro build defaults to the old Vercel root, making every
// Pages-path browser test time out. Build the correct target before preview.
const webServerCommand = process.env.CI ? previewCommand : `npm run build && ${previewCommand}`;

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
    command: webServerCommand,
    url: `${baseURL}questionnaire/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { COMMUNITY_DEPLOY_TARGET: 'github-pages' },
  },
});
