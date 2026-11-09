import { expect, test } from '@playwright/test';

// Every repeated source caption/value may occur in many independent questions.
// Filtering makes every binding inspectable; it must never batch-edit or approve.
test('a reviewer can inspect 64/23/37 exact source-option occurrences and exit safely', async ({ page }) => {
  const unexpectedRequests = [];
  page.on('request', request => {
    if (request.method() !== 'GET' || !request.url().startsWith('http://127.0.0.1:')) {
      unexpectedRequests.push(request.method());
    }
  });
  await page.goto('/the-community-lab/translation-review/');
  await page.locator('#scale-review summary').click();
  const cards = page.locator('#scale-review-list li');
  await expect(cards).toHaveCount(12);
  await cards.nth(0).getByRole('button', { name: '逐题核对本组全部 64 处' }).click();
  await expect(page.locator('#scale-active-filter')).toBeVisible();
  await expect(page.locator('#scale-active-caption')).toContainText('原始值 1');
  await expect(page.locator('#count')).toHaveText('显示 64 / 124 题');
  await expect(page.locator('#list .card')).toHaveCount(64);
  await expect(page.locator('#list .translation').first()).toBeFocused();
  await expect(page.locator('#list .card .review select')).toHaveCount(64);
  expect(await page.locator('#list .card .review select').evaluateAll(
    els => els.every(el => el.value === 'pending')
  )).toBe(true);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);

  await page.getByRole('button', { name: /退出此组筛选/ }).click();
  await expect(page.locator('#scale-active-filter')).toBeHidden();
  await expect(page.locator('#list .card')).toHaveCount(124);
  await expect(page.locator('#scale-review-summary')).toBeFocused();

  await cards.nth(6).getByRole('button', { name: '逐题核对本组全部 23 处' }).click();
  await expect(page.locator('#count')).toHaveText('显示 23 / 124 题');
  await expect(page.locator('#list .card')).toHaveCount(23);

  await cards.nth(10).getByRole('button', { name: '逐题核对本组全部 37 处' }).click();
  await expect(page.locator('#count')).toHaveText('显示 37 / 124 题');
  await expect(page.locator('#list .card')).toHaveCount(37);
  await page.locator('#search').fill('sa09');
  await expect(page.locator('#scale-active-filter')).toBeHidden();
  await expect(page.locator('#count')).toHaveText('显示 1 / 124 题');
  await expect(page.locator('#list h2').first()).toContainText('sa09');
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(unexpectedRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(page.viewportSize().width);
});
