import { defineConfig } from '@playwright/test';

// Multiple authorized agents may run browser QA at once on the same Mac.
// Preserve CI's default but allow isolated local listeners without killing
// someone else's preview process or accepting an unsafe shell argument.
const portText = process.env.COMMUNITY_BROWSER_PORT ?? '4321';
if (!/^\d+$/.test(portText) || Number(portText) < 1024 || Number(portText) > 65535) {
  throw new Error('COMMUNITY_BROWSER_PORT must be an integer between 1024 and 65535');
}
const port = Number(portText);
const baseURL = `http://127.0.0.1:${port}/the-community-lab/`;
// Astro 7 auto-detaches preview servers when it detects an AI agent. That
// makes Playwright's managed webServer exit early, so use its documented
// foreground mode and rely on the isolated port for concurrency.
const previewCommand = `npm run preview -- --host 127.0.0.1 --port ${port} --ignore-lock`;
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
    // Avoid accidentally testing against a preview built with a different base path.
    reuseExistingServer: false,
    timeout: 120_000,
    env: { COMMUNITY_DEPLOY_TARGET: 'github-pages' },
  },
});
