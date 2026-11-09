import { expect, test } from '@playwright/test';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { createPrivateProgressReceipt } from '../lib/full-questionnaire.mjs';

const pack = loadFullQuestionnaire();
const revised = [
  ['s1-politics-11', '与由政府制定政策相比，交由自由市场调节更好。'],
  ['s1-openness-12', '少数人为多数人作出牺牲并服从，是民主的原则。'],
];

for (const [id, chinese] of revised) {
  test(id + ' shows the Korean original before the refreshed Chinese draft without submitting', async ({ page }) => {
    const questionIndex = pack.seasons[1].findIndex(q => q.id === id);
    expect(questionIndex).toBeGreaterThanOrEqual(0);
    const q = pack.seasons[1][questionIndex];
    const blank = createPrivateProgressReceipt(pack, 1, {}, questionIndex);
    const requests = [];
    page.on('request', req => { if (!['GET', 'HEAD'].includes(req.method())) requests.push(req.method()); });
    await page.goto('/the-community-lab/questionnaire/');
    await page.locator('#full-import-file').setInputFiles({
      name: 'synthetic-empty-s1-progress.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(blank)),
    });
    await expect(page.locator('#full-quiz')).toBeVisible();
    await expect(page.locator('#full-group')).toContainText(id);
    await expect(page.locator('#full-ko')).toHaveText(q.sourceKo);
    await expect(page.locator('#full-ko')).toHaveAttribute('lang', 'ko');
    await expect(page.locator('#full-zh')).toHaveText(chinese);
    const korean = await page.locator('#full-ko').boundingBox();
    const chineseBox = await page.locator('#full-zh').boundingBox();
    expect(chineseBox.y).toBeGreaterThan(korean.y);
    const options = page.locator('#full-choices > button');
    await expect(options).toHaveCount(6);
    for (const [index, original] of q.options.entries()) {
      await expect(options.nth(index)).toContainText(String(original.value));
    }
    await options.first().click();
    await expect(options.first()).toHaveAttribute('aria-checked', 'true');
    expect(requests).toEqual([]);
    const width = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(width).toBeLessThanOrEqual(1);
  });
}
