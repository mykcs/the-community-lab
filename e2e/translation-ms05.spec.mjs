import { expect, test } from '@playwright/test';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { createPrivateProgressReceipt } from '../lib/full-questionnaire.mjs';

const pack = loadFullQuestionnaire();
const index = pack.seasons[2].findIndex(q => q.id === 'ms05');
const question = pack.seasons[2][index];
const revised = '如果对方是我非常讨厌的那类人，即使对我的工作成果很有帮助，我也不会在私下与其深交。';

test('S2 ms05 shows social rather than romantic closeness, preserves original choice values', async ({ page }) => {
  // Synthetic local-only import jumps to the existing Korean source question.
  const progress = createPrivateProgressReceipt(pack, 2, {}, index);
  const nonGet = [];
  page.on('request', request => {
    if (!['GET', 'HEAD'].includes(request.method())) nonGet.push(request.method());
  });
  await page.goto('/the-community-lab/questionnaire/');
  await page.locator('#full-import-file').setInputFiles({
    name: 'synthetic-ms05.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(progress)),
  });
  await expect(page.locator('#full-group')).toContainText('ms05');
  await expect(page.locator('#full-ko')).toHaveText(question.sourceKo);
  await expect(page.locator('#full-ko')).toHaveAttribute('lang', 'ko');
  await expect(page.locator('#full-zh')).toHaveText(revised);
  const original = page.locator('#full-choices > button');
  await expect(original).toHaveCount(2);
  await expect(original.first()).toContainText('O');
  await expect(original.last()).toContainText('X');
  const koBox = await page.locator('#full-ko').boundingBox();
  const zhBox = await page.locator('#full-zh').boundingBox();
  expect(koBox && zhBox && zhBox.y > koBox.y).toBeTruthy();
  await original.first().click();
  await expect(original.first()).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
  expect(nonGet).toEqual([]);
});
