import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const reviewPages = [
  new URL('../docs/original-question-translation-review/index.html', import.meta.url).href,
  new URL('../docs/translation-review/index.html', import.meta.url).href,
];

async function monitorDownloadLifecycle(page) {
  await page.evaluate(() => {
    window.__syntheticDownloadTrace = { clicks: [], revocations: [] };
    const nativeClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      window.__syntheticDownloadTrace.clicks.push({
        attachedDuringClick: this.isConnected,
        url: this.href,
        filename: this.download,
      });
      return nativeClick.call(this);
    };
    const nativeRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = function (url) {
      window.__syntheticDownloadTrace.revocations.push(url);
      return nativeRevoke.call(this, url);
    };
  });
}

async function expectSafeDownload(page, selector, filename) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator(selector).click()]);
  expect(download.suggestedFilename()).toBe(filename);
  const trace = await page.evaluate(() => window.__syntheticDownloadTrace);
  expect(trace.clicks).toHaveLength(1);
  expect(trace.clicks[0].filename).toBe(filename);
  expect(trace.clicks[0].attachedDuringClick).toBe(true);
  // Some browsers consume an object URL asynchronously after click returns.
  // Do not revoke it synchronously: doing so risks a lost private backup.
  expect(trace.revocations).not.toContain(trace.clicks[0].url);
}

for (const [index, url] of reviewPages.entries()) {
  test(`review page ${index + 1} leaves its private JSON URL live after click`, async ({ page }) => {
    await page.goto(url);
    await monitorDownloadLifecycle(page);
    await page.getByLabel('s1-politics-01 中文翻译').fill('仅用于本地下载回归的虚构文字');
    await expectSafeDownload(page, '#export', 'original-question-translation-review.json');
  });
}

test('two-review comparison JSON also stays available after the browser click', async ({ page }) => {
  const source = readFileSync(new URL('../docs/translation-review/index.html', import.meta.url), 'utf8');
  const json = source.split('<script id="embedded-data" type="application/json">')[1]?.split('</script>')[0];
  if (!json) throw new Error('No source draft to build the synthetic comparison fixture');
  const payload = Buffer.from(json);
  await page.goto(reviewPages[1]);
  await monitorDownloadLifecycle(page);
  await page.locator('#compare-files').setInputFiles([
    { name: 'synthetic-review-one.json', mimeType: 'application/json', buffer: payload },
    { name: 'synthetic-review-two.json', mimeType: 'application/json', buffer: payload },
  ]);
  await expect(page.locator('#comparison')).toBeVisible();
  await expectSafeDownload(page, '#comparison button', 'translation-review-comparison-unverified.json');
});
