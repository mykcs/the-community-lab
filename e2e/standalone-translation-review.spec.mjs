import { expect, test } from '@playwright/test';

// Standalone HTML is deployed as a second, offline-friendly reviewer entry point.
// Synthetic review edits only; no real reviewer or questionnaire answers.
const standaloneUrl = new URL('../docs/original-question-translation-review/index.html', import.meta.url).href;
const questionId = 's1-politics-01';

const { readFile } = await import('node:fs/promises');
const standaloneHtml = await readFile(new URL('../docs/original-question-translation-review/index.html', import.meta.url), 'utf8');
const standaloneData = JSON.parse(standaloneHtml.match(/<script id="embedded-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);

test('standalone reviewer imports a same-source draft and compares two exports locally', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(standaloneUrl);

  const imported = structuredClone(standaloneData);
  imported.questions[0].translation_zh_cn = '仅供浏览器验收的合成译文';
  imported.questions[0].human_review_note = '合成备注，不含个人信息';
  await page.locator('#import-file').setInputFiles({
    name: 'synthetic-review.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await expect(page.getByLabel(`${questionId} 中文翻译`)).toHaveValue('仅供浏览器验收的合成译文');
  await expect(page.locator('.statusline')).toContainText('自报状态，未独立核验');

  const left = structuredClone(standaloneData);
  const right = structuredClone(standaloneData);
  left.questions[0].translation_zh_cn = '审校稿甲';
  right.questions[0].translation_zh_cn = '审校稿乙';
  await page.locator('#compare-files').setInputFiles([
    { name: 'review-a.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(left)) },
    { name: 'review-b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(right)) },
  ]);
  await expect(page.getByRole('heading', { name: '两份审校文件的本机差异对照' })).toBeVisible();
  await expect(page.locator('#comparison')).toContainText('译文不一致：1');
  await expect(page.locator('#comparison')).toContainText('s1-politics-01 · 译文不同');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '下载去备注的差异 JSON' }).click(),
  ]);
  const summary = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(summary.status).toBe('LOCAL_TWO_EXPORT_COMPARISON_UNVERIFIED');
  expect(JSON.stringify(summary)).not.toContain('合成备注');
  expect(JSON.stringify(summary)).not.toContain('审校稿甲');
  expect(errors).toEqual([]);
});

test('rp12 comparison renders with the reviewed Korean and current Chinese draft', async ({ page }) => {
  await page.goto(standaloneUrl);
  await expect(page.getByText('규칙을 철저히 지키느라 일을 그르치는 사람보다 규칙을 조금 어기더라도 성과를 내는 사람이 유능한 인재다.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('rp12 中文翻译')).toHaveValue('比起因严格遵守规则而把事情办砸的人，稍微违反规则却能取得成果的人更有能力。');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test('S1 idiom condition and degree render in the unreviewed Chinese draft', async ({ page }) => {
  await page.goto(standaloneUrl);
  const translation = page.getByLabel('s1-openness-11 中文翻译');
  await expect(translation).toBeVisible();
  await expect(translation).toHaveValue('“如果不喜欢寺庙，和尚就该离开”这句话在大多数情况下是对的。');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

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
