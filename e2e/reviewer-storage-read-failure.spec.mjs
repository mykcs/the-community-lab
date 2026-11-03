import { expect, test } from '@playwright/test';

// Synthetic offline review drafts only. A failed localStorage read must never
// turn an unknown existing draft into an apparently empty, overwriteable one.
const pages = [
  ['main reviewer', new URL('../docs/translation-review/index.html', import.meta.url).href],
  ['standalone reviewer', new URL('../docs/original-question-translation-review/index.html', import.meta.url).href],
];

for (const [name, url] of pages) {
  test(`${name} preserves the existing draft when stored edits cannot be read`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    const translation = page.locator('#list .card').first().getByLabel(/中文翻译/);
    const previous = '合成旧审校草稿：不得被空白覆盖';
    await translation.fill(previous);
    await expect(page.locator('.statusline')).toContainText('已保存到此设备');

    await page.addInitScript(() => {
      const original = Storage.prototype.getItem;
      window.restoreReadAccess = () => { Storage.prototype.getItem = original; };
      Storage.prototype.getItem = function (key) {
        if (key.startsWith('community-lab-question-review-v1:')) {
          throw new DOMException('Synthetic read access denied', 'SecurityError');
        }
        return original.call(this, key);
      };
    });
    await page.reload();
    await expect(page.locator('.statusline')).toContainText('无法读取本机历史审校记录');

    // Even if access returns mid-session, an untrusted empty editor must NOT
    // overwrite history without explicit deletion or a safe reload.
    await page.evaluate(() => window.restoreReadAccess());
    await translation.fill('合成新修改：只能留在内存并允许导出');
    await expect(page.locator('.statusline')).toContainText('未保存到此设备');
    const stored = await page.evaluate(() => {
      const key = Object.keys(localStorage).find(k => k.startsWith('community-lab-question-review-v1:'));
      return key ? localStorage.getItem(key) : null;
    });
    expect(stored).toContain(previous);
    expect(stored).not.toContain('合成新修改：只能留在内存并允许导出');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#export').click(),
    ]);
    const { readFile } = await import('node:fs/promises');
    const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(exported.questions[0].translation_zh_cn).toBe('合成新修改：只能留在内存并允许导出');

    const dialogs = [];
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
    await page.locator('#clear').click();
    await expect(page.locator('.statusline')).toContainText('审校记录已清除');
    await translation.fill('合成明确清除后允许正常保存');
    await expect(page.locator('.statusline')).toContainText('已保存到此设备');
    expect(dialogs.some(message => message.includes('清除此设备'))).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('main reviewer refuses import overwrite after initial local draft read failed', async ({ page }) => {
  const url = pages[0][1];
  await page.goto(url);
  const translation = page.locator('#list .card').first().getByLabel(/中文翻译/);
  await translation.fill('合成旧草稿：导入也不能偷偷覆盖');
  await page.addInitScript(() => {
    const original = Storage.prototype.getItem;
    window.restoreReadAccess = () => { Storage.prototype.getItem = original; };
    Storage.prototype.getItem = function (key) {
      if (key.startsWith('community-lab-question-review-v1:')) {
        throw new DOMException('Synthetic read access denied', 'SecurityError');
      }
      return original.call(this, key);
    };
  });
  await page.reload();
  await expect(page.locator('.statusline')).toContainText('无法读取本机历史审校记录');
  await page.evaluate(() => window.restoreReadAccess());
  const record = JSON.parse(await page.locator('#embedded-data').textContent());
  record.questions[0].translation_zh_cn = '合成新文件：不得覆盖未读旧草稿';
  const dialogs = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
  await page.locator('#import-file').setInputFiles({
    name: 'synthetic-review.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(record)),
  });
  expect(dialogs.some(message => message.includes('无法读取本机历史审校记录'))).toBe(true);
  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('community-lab-question-review-v1:'));
    return key ? localStorage.getItem(key) : null;
  });
  expect(stored).toContain('合成旧草稿：导入也不能偷偷覆盖');
  expect(stored).not.toContain('合成新文件：不得覆盖未读旧草稿');
});
