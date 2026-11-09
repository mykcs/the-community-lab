import { expect, test } from '@playwright/test';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { createPrivateProgressReceipt } from '../lib/full-questionnaire.mjs';

// A local browser download is NOT a promise that the device's Downloads folder
// is exempt from iCloud/OneDrive backup. Test the disclosure on all three views.
// This uses a synthetic answer vector, never a real person's political choices.
test('private answer downloads disclose possible device-side cloud sync in both viewports', async ({ page }) => {
  const writes = [];
  page.on('request', request => {
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url());
  });

  await page.goto('/the-community-lab/questionnaire/');
  await expect(page.locator('#full-select .full-resume')).toContainText('iCloud Drive、OneDrive');
  await expect(page.locator('#full-select > .full-local')).toContainText('云同步服务');
  await page.locator('[data-start-season="2"]').click();
  await expect(page.locator('#full-quiz .full-quiz-disclosure')).toContainText('个人云盘');
  await page.locator('.full-choice').first().click();
  await expect(page.locator('#full-save')).toBeVisible();
  const [progressFile] = await Promise.all([
    page.waitForEvent('download'), page.locator('#full-save').click(),
  ]);
  expect(progressFile.suggestedFilename()).toBe('community-private-season-2-progress.json');

  const pack = loadFullQuestionnaire();
  const questions = pack.seasons[2];
  const choices = Object.fromEntries(questions.map(question =>
    [question.id, question.options[0].value]));
  const receipt = createPrivateProgressReceipt(pack, 2, choices, questions.length - 1);
  await page.goto('/the-community-lab/questionnaire/');
  await page.locator('#full-import-file').setInputFiles({
    name: 'synthetic-private-complete.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(receipt)),
  });
  await expect(page.locator('#full-done')).toBeVisible();
  await expect(page.locator('#full-done > .full-local')).toContainText('云存储服务');
  const [completedFile] = await Promise.all([
    page.waitForEvent('download'), page.locator('#full-download').click(),
  ]);
  expect(completedFile.suggestedFilename()).toBe('community-source-draft-season-2-answers.json');
  expect(writes).toEqual([]);
});
