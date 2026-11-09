import { expect, test } from '@playwright/test';

// A compact read-only reviewer shortcut, never a substitute for independent
// bilingual examination of every question's meaning and source value.
test('all 550 original options collapse to 12 reviewable caption/value identities', async ({ page }) => {
  const requests = [];
  page.on('request', request => {
    if (request.method() !== 'GET' || !request.url().startsWith('http://127.0.0.1:')) {
      requests.push(request.method());
    }
  });
  await page.goto('/the-community-lab/translation-review/');
  const details = page.locator('#scale-review');
  const summary = details.locator('summary');
  await expect(summary).toContainText('12 组原始选项 / 550 个题内选项');
  await summary.click();
  const cards = page.locator('#scale-review-list li');
  await expect(cards).toHaveCount(12);
  await expect(page.locator('#scale-review-blank-note')).toContainText('128 个选项');
  await expect(details).toContainText('未经独立韩中人工审核');
  const stats = await cards.evaluateAll(items => items.map(item => {
    const value = item.textContent.match(/题内出现 (\d+) 次/);
    return Number(value?.[1] ?? 0);
  }));
  expect(stats.reduce((a, b) => a + b, 0)).toBe(550);
  const korean = cards.locator('.scale-ko');
  expect(await korean.count()).toBe(12);
  expect(await korean.filter({ hasText: '（源客户端此档无韩文文字标签）' }).count()).toBe(2);
  const before = await page.evaluate(() => localStorage.length);
  const first = cards.first();
  const sourceId = (await first.locator('button').innerText()).replace('查看代表题 ', '');
  await first.locator('button').click();
  await expect(page.locator('#search')).toHaveValue(sourceId);
  await expect(page.locator('#count')).toHaveText('显示 1 / 124 题');
  await expect(page.locator('#list .card')).toHaveCount(1);
  await expect(page.locator('#list .translation')).toBeFocused();
  expect(await page.evaluate(() => localStorage.length)).toBe(before);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(page.viewportSize().width);
});

test('read-only reviewer grouping never auto-upgrades or edits official source data', async ({ page }) => {
  await page.goto('/the-community-lab/translation-review/');
  await page.locator('#scale-review summary').click();
  const snapshot = await page.evaluate(() => {
    const data = JSON.parse(document.querySelector('#embedded-data').textContent);
    return {
      sourceSha256: data.source.asset_sha256,
      questionCount: data.questions.length,
      statuses: [...new Set(data.questions.map(q => q.review_status))],
      saved: localStorage.length,
      options: data.questions.reduce((n, q) => n + q.options.length, 0),
    };
  });
  expect(snapshot).toEqual({
    sourceSha256: '59a67f9d1e0049156bedfe4d61a4cf8511dc8903ba80cf297b6bffad3c2b379e',
    questionCount: 124,
    statuses: ['draft'],
    saved: 0,
    options: 550,
  });
});
