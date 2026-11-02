import { expect, test } from '@playwright/test';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { createPrivateProgressReceipt } from '../lib/full-questionnaire.mjs';

test('S1 private education draft preserves the full Korean category and original 1-6 values', async ({ page }) => {
  const pack = loadFullQuestionnaire();
  const position = pack.seasons[1].findIndex(q => q.id === 's1-politics-06');
  expect(position).toBeGreaterThanOrEqual(0);
  const question = pack.seasons[1][position];
  const blank = createPrivateProgressReceipt(pack, 1, {}, position);
  const posts = [];
  page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
  await page.goto('/the-community-lab/questionnaire/');
  await page.locator('#full-import-file').setInputFiles({
    name: 'synthetic-empty-progress.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(blank)),
  });
  await expect(page.locator('#full-quiz')).toBeVisible();
  await expect(page.locator('#full-group')).toContainText('s1-politics-06');
  await expect(page.locator('#full-ko')).toHaveText(question.sourceKo);
  await expect(page.locator('#full-ko')).toHaveAttribute('lang', 'ko');
  await expect(page.locator('#full-zh')).toHaveText('高收费的校外教育培训应受到监管。');
  const korean = await page.locator('#full-ko').boundingBox();
  const chinese = await page.locator('#full-zh').boundingBox();
  expect(chinese.y).toBeGreaterThan(korean.y);
  const buttons = page.locator('#full-choices > button');
  await expect(buttons).toHaveCount(question.options.length);
  for (let i = 0; i < question.options.length; i++) {
    await expect(buttons.nth(i)).toContainText(String(question.options[i].value));
  }
  await buttons.first().click();
  await expect(buttons.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#full-count')).toContainText('已答 1 / 87');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(posts).toEqual([]);
});
