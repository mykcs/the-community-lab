import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';

const reviewUrl = new URL('../docs/translation-review/index.html', import.meta.url).href;
const html = readFileSync(new URL('../docs/translation-review/index.html', import.meta.url), 'utf8');
const embedded = html.split('<script id="embedded-data" type="application/json">')[1]?.split('</script>')[0];
if (!embedded) throw new Error('公开译审页面缺少本地数据');
const original = JSON.parse(embedded);

// Every Chinese edit remains within the per-field validation contract.
// This valid review export is too large for the previous 1 MiB input limit.
function largeSyntheticReview() {
  const record = structuredClone(original);
  for (const question of record.questions) {
    question.translation_zh_cn = '本地合成审校文字'.repeat(1100);
    question.human_review_status = 'pending';
    question.human_review_note = '';
  }
  const buffer = Buffer.from(JSON.stringify(record));
  if (buffer.byteLength <= 1024 * 1024 || buffer.byteLength >= 8 * 1024 * 1024) {
    throw new Error('合成导出尺寸不在回归测试范围');
  }
  return buffer;
}

test('valid multi-question reviewer export above 1 MiB can be restored and compared offline', async ({ page }) => {
  test.setTimeout(100_000);
  const buffer = largeSyntheticReview();
  const file = { name: 'synthetic-review.json', mimeType: 'application/json', buffer };
  await page.goto(reviewUrl);
  const dialogs = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.type() + ': ' + dialog.message()); await dialog.accept(); });
  await page.locator('#import-file').setInputFiles(file);
  await expect(page.locator('.statusline')).toContainText('已从同一来源版本恢复');
  await expect(page.locator('#list .card').first().getByLabel(/中文翻译/)).toHaveValue('本地合成审校文字'.repeat(1100));
  await page.locator('#compare-files').setInputFiles([file, file]);
  await expect(page.locator('#comparison')).toBeVisible();
  await expect(page.locator('#comparison')).toContainText('同稿双份自报通过（未核验）');
  expect(dialogs.filter(message => message.startsWith('alert:'))).toEqual([]);
});

test('review edits remain exportable and visibly unsaved when local browser storage is full', async ({ page }) => {
  await page.goto(reviewUrl);
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    window.restoreReviewStorage = () => { Storage.prototype.setItem = originalSetItem; };
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('community-lab-question-review-v1:')) {
        throw new DOMException('Synthetic storage quota exceeded', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    };
  });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const translation = page.locator('#list .card').first().getByLabel(/中文翻译/);
  const editedText = '合成译审：本机配额已满时仍可导出';
  await translation.fill(editedText);
  await expect(page.locator('.statusline')).toContainText('未保存到此设备');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export').click(),
  ]);
  const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(backup.questions[0].translation_zh_cn).toBe(editedText);
  expect(pageErrors).toEqual([]);
  await page.evaluate(() => window.restoreReviewStorage());
  await translation.fill(editedText + '，存储恢复');
  await expect(page.locator('.statusline')).toContainText('已保存到此设备');
});

test("reviewer clear fails closed when browser storage rejects removal, then recovers", async ({ page }) => {
  await page.goto(reviewUrl);
  const errors = [];
  const messages = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", async dialog => { messages.push(dialog.type() + ": " + dialog.message()); await dialog.accept(); });
  const translation = page.locator("#list .card").first().getByLabel(/中文翻译/);
  const baseline = await translation.inputValue();
  await translation.fill("合成待清除审校信息");
  await expect(page.locator(".statusline")).toContainText("已保存到此设备");
  await page.evaluate(() => {
    const realRemove = Storage.prototype.removeItem;
    window.restoreReviewRemove = () => { Storage.prototype.removeItem = realRemove; };
    Storage.prototype.removeItem = function(key) {
      if (key.startsWith("community-lab-question-review-v1:")) throw new DOMException("Synthetic storage blocked", "SecurityError");
      return realRemove.call(this,key);
    };
  });
  await page.locator("#clear").click();
  expect(messages.some(message => message.startsWith("alert: 清除失败"))).toBe(true);
  await expect(translation).toHaveValue("合成待清除审校信息");
  expect(errors).toEqual([]);
  await page.evaluate(() => window.restoreReviewRemove());
  await page.locator("#clear").click();
  await expect(translation).toHaveValue(baseline);
  await expect(page.locator(".statusline")).toContainText("审校记录已清除");
  expect(errors).toEqual([]);
});

test('offline export/import retains the pre-edit note basis and rejects undo to an old remark', async ({ page, browser }) => {
  const id = 's1-politics-01';
  await page.goto(reviewUrl);
  const oldRemark = '合成旧备注：只审核过上一版中文';
  const freshRemark = '合成新备注：已审核当前中文内容及所有选项';
  await page.getByLabel(`${id} 审校备注`).fill(oldRemark);
  await page.getByLabel(`${id} 中文翻译`).fill('合成当前新版中文内容');
  await page.getByLabel(`${id} 审校备注`).fill(freshRemark);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export').click(),
  ]);
  const contents = await readFile(await download.path());
  const exported = JSON.parse(contents.toString('utf8'));
  const row = exported.questions.find(q => q.id === id);
  expect(row.human_review_note_stale).toBe(false);
  expect(row.human_review_note_stale_original).toBe(oldRemark);
  const newContext = await browser.newContext();
  try {
    const restoredPage = await newContext.newPage();
    restoredPage.on('dialog', dialog => dialog.accept());
    await restoredPage.goto(reviewUrl);
    await restoredPage.locator('#import-file').setInputFiles({
      name: 'synthetic-review-roundtrip.json',
      mimeType: 'application/json',
      buffer: contents,
    });
    await expect(restoredPage.locator('.statusline')).toContainText('已从同一来源版本恢复');
    const note = restoredPage.getByLabel(`${id} 审校备注`);
    const status = restoredPage.getByLabel(`${id} 复核状态`);
    await expect(note).toHaveValue(freshRemark);
    await note.fill(oldRemark + ' ');
    await status.selectOption('pass');
    await expect(status).toHaveValue('pending');
    await note.fill('合成二次审核：当前翻译已重新核对');
    await status.selectOption('pass');
    await expect(status).toHaveValue('pass');
  } finally {
    await newContext.close();
  }
});
