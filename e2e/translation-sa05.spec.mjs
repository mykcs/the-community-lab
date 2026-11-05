import { expect, test } from '@playwright/test';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { createPrivateProgressReceipt } from '../lib/full-questionnaire.mjs';

const pack = loadFullQuestionnaire();
const sa05 = pack.seasons[2].find(question => question.id === 'sa05');
const updatedChinese = '用缴纳所得税和财产税后积累的资产传给子女时，还要征收遗产税，是对个人资产的过度侵害。';

test('S2 sa05 shows the fixed AI Chinese wording below unchanged Korean in both viewports', async ({ page }) => {
  // Import a synthetic, local-only progress file to reach the precise test item.
  // No production submissions, visitor identities or personal answers.
  const progress = createPrivateProgressReceipt(
    pack, 2, { [sa05.id]: sa05.options[0].value },
    pack.seasons[2].findIndex(q => q.id === sa05.id),
  );
  await page.goto('/the-community-lab/questionnaire/');
  await page.locator('#full-import-file').setInputFiles({
    name: 'synthetic-sa05-progress.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(progress)),
  });
  await expect(page.locator('#full-ko')).toHaveText(sa05.sourceKo);
  await expect(page.locator('#full-zh')).toHaveText(updatedChinese);
  await expect(page.locator('#full-ko')).toBeVisible();
  await expect(page.locator('#full-zh')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth + 1));
});
