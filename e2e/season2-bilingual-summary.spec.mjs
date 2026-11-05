import { expect, test } from '@playwright/test';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { createPrivateProgressReceipt } from '../lib/full-questionnaire.mjs';

const pack = loadFullQuestionnaire();

test('completed S2 source-group counts remain Korean-first with Chinese draft captions', async ({ page }) => {
  const questions = pack.seasons[2];
  const answers = Object.fromEntries(questions.map(q => [q.id, q.options[0].value]));
  const receipt = createPrivateProgressReceipt(pack, 2, answers, questions.length - 1);
  const expected = [...new Map(questions.map(q => [q.group, q.groupKo])).entries()];

  const officialPosts = [];
  page.on('request', request => {
    if (request.method() === 'POST' &&
        (request.url().includes('thecommunity.co.kr') ||
         request.url().includes('the-community-survey.web.app'))) {
      officialPosts.push(request.url());
    }
  });

  await page.goto('/the-community-lab/questionnaire/');
  await page.locator('#full-import-file').setInputFiles({
    name: 'synthetic-s2-bilingual-summary.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(receipt)),
  });
  await expect(page.locator('#full-done')).toBeVisible();
  await expect(page.locator('#full-done')).toContainText('这里不显示官方分数或嘉宾匹配');
  const rows = page.locator('#full-group-summary > div');
  await expect(rows).toHaveCount(3);
  let total = 0;
  for (const [i, [zh, ko]] of expected.entries()) {
    const row = rows.nth(i);
    const label = row.locator('span').first();
    const original = label.locator('[lang="ko"]');
    await expect(original).toHaveText(ko);
    await expect(label).toContainText(zh);
    const text = await label.textContent();
    expect(text.indexOf(ko)).toBeLessThan(text.indexOf(zh));
    const value = await row.locator('strong').textContent();
    total += Number(value.split(' ')[0]);
  }
  expect(total).toBe(37);
  expect(officialPosts).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth + 1));
});
