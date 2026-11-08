import { expect, test } from '@playwright/test';

// Both reviewer pages are real public Pages routes. Before the fix, the local
// Astro preview and browser CI returned 404 for both on both viewport sizes,
// because the deploy workflow (not the shared build) copied their HTML.
for (const route of ['translation-review', 'original-question-translation-review']) {
  test(`Pages build preview serves and runs ${route} without transmitting reviewer edits`, async ({ page }) => {
    const scriptErrors = [];
    const outgoingWrites = [];
    page.on('pageerror', error => scriptErrors.push(error.message));
    page.on('request', request => {
      if (!['GET', 'HEAD'].includes(request.method())) outgoingWrites.push(request.method());
    });
    const response = await page.goto(`/the-community-lab/${route}/`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('#embedded-data')).toHaveCount(1);
    await expect(page.getByLabel('筛选季别')).toHaveValue('all');
    await expect(page.locator('#count')).toContainText('124');
    await page.getByLabel('筛选季别').selectOption('2');
    await expect(page.locator('#count')).toContainText('37 / 124');
    await expect(page.getByLabel('sa04 中文翻译')).toHaveValue(
      '贫困者之所以无法摆脱贫困，主要是因为他们自身的意志和努力都不够。');
    await page.getByLabel('筛选季别').selectOption('1');
    await expect(page.locator('#count')).toContainText('87 / 124');
    expect(scriptErrors).toEqual([]);
    expect(outgoingWrites).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(page.viewportSize().width);
  });
}
