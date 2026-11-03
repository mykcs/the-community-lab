import { expect, test } from '@playwright/test';

// Standalone HTML is deployed as a second, offline-friendly reviewer entry point.
// Synthetic review edits only; no real reviewer or questionnaire answers.
const standaloneUrl = new URL('../docs/original-question-translation-review/index.html', import.meta.url).href;
const questionId = 's1-politics-01';

test('standalone reviewer cannot self-report a pass without notes or retain it after edits', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(standaloneUrl);

  const status = page.getByLabel(`${questionId} 复核状态`);
  const note = page.getByLabel(`${questionId} 审校备注`);
  const translation = page.getByLabel(`${questionId} 中文翻译`);
  const option = page.getByLabel(`${questionId} 选项 1 中文`);

  await status.selectOption('pass');
  await expect(status).toHaveValue('pending');
  await note.fill('测试审校代号，韩中能力依据待核，日期 2026-11-02');
  await status.selectOption('pass');
  await expect(status).toHaveValue('pass');

  await translation.fill('仅供测试的中文修订，不是正式审校');
  await expect(status).toHaveValue('pending');
  await status.selectOption('pass');
  await expect(status).toHaveValue('pending'); // Original note is stale.
  await note.fill('测试审校代号，已重新核对题意和选项，日期 2026-11-02');
  await status.selectOption('pass');
  await expect(status).toHaveValue('pass');
  await option.fill('仅供测试的选项修订');
  await expect(status).toHaveValue('pending');
  expect(errors).toEqual([]);
});

test('standalone search indexes locally edited Chinese answer choices', async ({ page }) => {
  await page.goto(standaloneUrl);
  const option = page.getByLabel(`${questionId} 选项 1 中文`);
  await option.fill('本地合成的选项检索标记-qa-20261102');
  await page.locator('#search').fill('本地合成的选项检索标记-qa-20261102');
  await expect(page.locator('#count')).toHaveText('显示 1 / 124 题');
  await expect(page.getByRole('heading', { name: new RegExp(questionId) })).toBeVisible();
  await expect(page.locator('#list .card')).toHaveCount(1);
});


// The independent offline HTML must protect edits just as the main review page does.
test('standalone reviewer warns and can export edits when storage quota is exceeded', async ({ page }) => {
  await page.goto(standaloneUrl);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.restoreSyntheticSetItem = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('community-lab-question-review-v1:')) {
        throw new DOMException('Synthetic storage full', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const translation = page.getByLabel(`${questionId} 中文翻译`);
  await translation.fill('独立审校页合成内容：配额不足');
  await expect(page.locator('.statusline')).toContainText('未保存到此设备');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export').click(),
  ]);
  const { readFile } = await import('node:fs/promises');
  const record = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(record.questions.find(q => q.id === questionId).translation_zh_cn).toBe('独立审校页合成内容：配额不足');
  expect(errors).toEqual([]);
  await page.evaluate(() => window.restoreSyntheticSetItem());
  await translation.fill('独立审校页合成内容：恢复保存');
  await expect(page.locator('.statusline')).toContainText('已保存到此设备');
});

test('standalone reviewer cannot claim a blocked local clear succeeded', async ({ page }) => {
  await page.goto(standaloneUrl);
  const errors = [];
  const messages = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => { messages.push(dialog.type() + ': ' + dialog.message()); await dialog.accept(); });
  const translation = page.getByLabel(`${questionId} 中文翻译`);
  const baseline = await translation.inputValue();
  await translation.fill('独立审校页合成草稿：不得误删');
  await page.evaluate(() => {
    const original = Storage.prototype.removeItem;
    window.restoreSyntheticRemoveItem = () => { Storage.prototype.removeItem = original; };
    Storage.prototype.removeItem = function(key) {
      if (key.startsWith('community-lab-question-review-v1:')) {
        throw new DOMException('Synthetic deletion denied', 'SecurityError');
      }
      return original.call(this, key);
    };
  });
  await page.locator('#clear').click();
  expect(messages.some(message => message.startsWith('alert: 清除失败'))).toBe(true);
  await expect(translation).toHaveValue('独立审校页合成草稿：不得误删');
  expect(errors).toEqual([]);
  await page.evaluate(() => window.restoreSyntheticRemoveItem());
  await page.locator('#clear').click();
  await expect(page.getByLabel(`${questionId} 中文翻译`)).toHaveValue(baseline);
  await expect(page.locator('.statusline')).toContainText('审校记录已清除');
  expect(errors).toEqual([]);
});
