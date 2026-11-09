import { test, expect } from '@playwright/test';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';

test('S1 protest prompt keeps raw scale and scoped Chinese meaning in both viewports', async ({ page }) => {
  const questions = loadFullQuestionnaire().seasons[1];
  const position = questions.findIndex(q => q.id === 's1-openness-20');
  const question = questions[position];
  const writes = [];
  page.on('request', request => {
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url());
  });
  await page.goto('/the-community-lab/questionnaire/?season=1');
  for (let index = 0; index < position; index++) {
    await page.locator('#full-choices [role="radio"]').first().click();
    await page.locator('#full-next').click();
  }
  await expect(page.locator('#full-group')).toContainText('s1-openness-20');
  await expect(page.locator('#full-ko')).toHaveText(question.sourceKo);
  await expect(page.locator('#full-zh')).toHaveText(question.draftZh);
  await expect(page.locator('#full-zh')).toContainText('造成不利影响');
  await expect(page.locator('#full-choices .full-choice-mark')).toHaveText(['1','2','3','4','5','6']);
  expect(writes).toEqual([]);
});
