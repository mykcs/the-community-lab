import { expect, test } from '@playwright/test';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { createPrivateProgressReceipt } from '../lib/full-questionnaire.mjs';

const id = 's1-gender-07';
const expected = '在演员、诗人、记者等职业称谓前加上‘女’字（如‘女演员’‘女诗人’‘女记者’），是贬低女性价值的一种方式。';

test('S1 gender07 corrected AI draft renders Korean-first and preserves source option values', async ({ page }) => {
  const pack = loadFullQuestionnaire();
  const index = pack.seasons[1].findIndex(q => q.id === id);
  expect(index).toBeGreaterThanOrEqual(0);
  const q = pack.seasons[1][index];
  const blank = createPrivateProgressReceipt(pack, 1, {}, index);
  const writes = [];
  page.on('request', req => { if (req.method() !== 'GET') writes.push(req.url()); });
  await page.goto('/the-community-lab/questionnaire/');
  await page.locator('#full-import-file').setInputFiles({
    name: 'synthetic-gender07-empty.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(blank)),
  });
  await expect(page.locator('#full-group')).toContainText(id);
  await expect(page.locator('#full-ko')).toHaveText(q.sourceKo);
  await expect(page.locator('#full-ko')).toHaveAttribute('lang', 'ko');
  await expect(page.locator('#full-zh')).toHaveText(expected);
  const korean = await page.locator('#full-ko').boundingBox();
  const chinese = await page.locator('#full-zh').boundingBox();
  expect(chinese.y).toBeGreaterThan(korean.y);
  const choices = page.locator('#full-choices > button');
  await expect(choices).toHaveCount(q.options.length);
  for (const [i, o] of q.options.entries()) {
    await expect(choices.nth(i).locator('.full-choice-mark')).toHaveText(String(o.value));
  }
  await choices.nth(1).click();
  await expect(choices.nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#full-count')).toContainText('已答 1 / 87');
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(page.viewportSize().width + 1);
  expect(writes).toEqual([]);
});
