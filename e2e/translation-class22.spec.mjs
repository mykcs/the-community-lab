import { expect, test } from '@playwright/test';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { createPrivateProgressReceipt } from '../lib/full-questionnaire.mjs';

test('S1 class-22 unreviewed study-abroad copy renders Korean-first with raw option values unchanged', async ({ page }) => {
  const pack = loadFullQuestionnaire();
  const index = pack.seasons[1].findIndex(q => q.id === 's1-class-22');
  expect(index).toBeGreaterThanOrEqual(0);
  const question = pack.seasons[1][index];
  const privateBlankProgress = createPrivateProgressReceipt(pack, 1, {}, index);
  const outgoing = [];
  page.on('request', request => { if (request.method() === 'POST') outgoing.push(request.url()); });

  await page.goto('/the-community-lab/questionnaire/');
  await page.locator('#full-import-file').setInputFiles({
    name: 'synthetic-empty-progress.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(privateBlankProgress)),
  });
  await expect(page.locator('#full-quiz')).toBeVisible();
  await expect(page.locator('#full-group')).toContainText('s1-class-22');
  await expect(page.locator('#full-ko')).toHaveText(question.sourceKo);
  await expect(page.locator('#full-ko')).toHaveAttribute('lang', 'ko');
  await expect(page.locator('#full-zh')).toHaveText('成年前，我的海外留学经历比较丰富。');
  await expect(page.locator('#full-choices > button')).toHaveCount(question.options.length);
  const koreanTop = await page.locator('#full-ko').boundingBox();
  const chineseBelow = await page.locator('#full-zh').boundingBox();
  expect(chineseBelow.y).toBeGreaterThan(koreanTop.y);
  await page.locator('.full-choice').first().click();
  await expect(page.locator('.full-choice').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#full-count')).toContainText('已答 1 / 87');
  const scroll = await page.evaluate(() => ({width: document.documentElement.scrollWidth, viewport: innerWidth}));
  expect(scroll.width).toBeLessThanOrEqual(scroll.viewport + 1);
  expect(outgoing).toEqual([]);
});
