import { test, expect } from '@playwright/test';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';

test('S1 ethnic-term clarification is visible in both viewports without altering source choice values', async ({ page }) => {
  const question = loadFullQuestionnaire().seasons[1].find(q => q.id === 's1-openness-04');
  const position = loadFullQuestionnaire().seasons[1].findIndex(q => q.id === question.id);
  const writes = [];
  page.on('request', r => {
    if (!['GET', 'HEAD'].includes(r.method())) writes.push(r.url());
  });
  await page.goto('/the-community-lab/questionnaire/?season=1');
  for (let i = 0; i < position; i++) {
    await page.locator('#full-choices [role="radio"]').first().click();
    await page.locator('#full-next').click();
  }
  await expect(page.locator('#full-group')).toContainText('s1-openness-04');
  await expect(page.locator('#full-ko')).toContainText(question.sourceKo);
  await expect(page.locator('#full-zh')).toHaveText(question.draftZh);
  const note = page.locator('#full-reader-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('中国朝鲜族');
  await expect(note).toContainText('不为题目中的犯罪率判断提供证据');
  await expect(note.locator('span[lang="ko"]')).toHaveText('조선족');
  await expect(page.locator('#full-choices .full-choice-mark')).toHaveText(['1','2','3','4','5','6']);
  expect(writes).toEqual([]);
});
