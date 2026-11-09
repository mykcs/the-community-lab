import { test, expect } from '@playwright/test';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';

test('S1 probability and live-in household drafts preserve source values on desktop and 440px mobile', async ({ page }) => {
  const questions = loadFullQuestionnaire().seasons[1];
  const ids = new Set(['s1-class-18', 's1-politics-08']);
  const seen = new Set();
  const writes = [];
  page.on('request', request => {
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.method());
  });
  await page.goto('/the-community-lab/questionnaire/?season=1');
  const lastIndex = Math.max(...questions.map((q, i) => ids.has(q.id) ? i : -1));
  for (let index = 0; index <= lastIndex; index++) {
    const q = questions[index];
    if (ids.has(q.id)) {
      seen.add(q.id);
      await expect(page.locator('#full-group')).toContainText(q.id);
      await expect(page.locator('#full-ko')).toHaveText(q.sourceKo);
      await expect(page.locator('#full-ko')).toHaveAttribute('lang', 'ko');
      await expect(page.locator('#full-zh')).toHaveText(q.draftZh);
      await expect(page.locator('#full-choices .full-choice-mark')).toHaveText(
        q.options.map(o => String(o.value)),
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    if (index < lastIndex) {
      await page.locator('#full-choices [role="radio"]').first().click();
      await page.locator('#full-next').click();
    }
  }
  expect(seen).toEqual(ids);
  expect(writes).toEqual([]);
});
