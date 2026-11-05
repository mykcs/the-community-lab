import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Completely synthetic edits: these tests never publish review claims or personal responses.
// The standalone review route intentionally has no import control.
const reviewerPaths = [['main reviewer', '../docs/translation-review/index.html']];

function makeImport(original, text, filename) {
  const copy = structuredClone(original);
  copy.questions[0].translation_zh_cn = text;
  return { name: filename, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(copy)) };
}

async function delayFileReads(page) {
  await page.evaluate(() => {
    const original = File.prototype.text;
    window.syntheticPendingReads = [];
    File.prototype.text = function() {
      const source = this;
      return new Promise(resolve => {
        window.syntheticPendingReads.push(async () => resolve(await original.call(source)));
      });
    };
  });
}

async function finishRead(page, index) {
  await page.evaluate(index => window.syntheticPendingReads[index](), index);
}

for (const [label, relative] of reviewerPaths) {
  const url = new URL(relative, import.meta.url).href;
  const html = readFileSync(new URL(relative, import.meta.url), 'utf8');
  const source = JSON.parse(html.split('<script id="embedded-data" type="application/json">')[1].split('</script>')[0]);

  test(label + ' keeps newer local edits when an older import finishes reading', async ({ page }) => {
    await page.goto(url);
    await delayFileReads(page);
    const dialogs = [];
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
    const translation = page.locator('#list .card').first().getByLabel(/中文翻译/);
    await page.locator('#import-file').setInputFiles(makeImport(source, '合成旧文件译文', 'older-synthetic.json'));
    await expect.poll(() => page.evaluate(() => window.syntheticPendingReads.length)).toBe(1);
    await translation.fill('文件读取期间新写的合成译文，必须保留');
    await expect(page.locator('.statusline')).toContainText('已保存');
    await finishRead(page, 0);
    await expect(page.locator('.statusline')).toContainText('导入已取消');
    await expect(translation).toHaveValue('文件读取期间新写的合成译文，必须保留');
    const stored = await page.evaluate(() => Object.values(localStorage).find(value => value.includes('文件读取期间新写的合成译文')));
    expect(stored).toBeTruthy();
    expect(dialogs).toEqual([]);
  });

  test(label + ' applies the last selected import, not an earlier slower file', async ({ page }) => {
    await page.goto(url);
    await delayFileReads(page);
    const prompts = [];
    page.on('dialog', async dialog => { prompts.push(dialog.message()); await dialog.accept(); });
    const translation = page.locator('#list .card').first().getByLabel(/中文翻译/);
    await page.locator('#import-file').setInputFiles(makeImport(source, '合成较早文件', 'first-synthetic.json'));
    await expect.poll(() => page.evaluate(() => window.syntheticPendingReads.length)).toBe(1);
    await page.locator('#import-file').setInputFiles(makeImport(source, '合成最新文件', 'second-synthetic.json'));
    await expect.poll(() => page.evaluate(() => window.syntheticPendingReads.length)).toBe(2);
    await finishRead(page, 1);
    await expect(translation).toHaveValue('合成最新文件');
    await finishRead(page, 0);
    await expect(translation).toHaveValue('合成最新文件');
    expect(prompts.filter(text => text.includes('将导入'))).toHaveLength(1);
    const stored = await page.evaluate(() => Object.values(localStorage).find(value => value.includes('合成最新文件')));
    expect(stored).toBeTruthy();
  });
}
