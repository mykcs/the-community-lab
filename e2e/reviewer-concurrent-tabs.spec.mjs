import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const mainHtml = readFileSync(fileURLToPath(new URL('../docs/translation-review/index.html', import.meta.url)), 'utf8');
const standaloneHtml = readFileSync(fileURLToPath(new URL('../docs/original-question-translation-review/index.html', import.meta.url)), 'utf8');
const base = JSON.parse(mainHtml.split('<script id="embedded-data" type="application/json">')[1].split('</script>')[0]);
const [firstId, secondId] = base.questions.slice(0, 2).map(q => q.id);
const host = 'http://127.0.0.1:4321';
const mainUrl = host + '/reviewer-concurrency/main';
const standaloneUrl = host + '/reviewer-concurrency/standalone';

async function openReviewPages(context, firstUrl = mainUrl, secondUrl = standaloneUrl) {
  await context.route('**/reviewer-concurrency/*', async route => {
    const body = route.request().url().endsWith('/standalone') ? standaloneHtml : mainHtml;
    await route.fulfill({ status: 200, contentType: 'text/html', body });
  });
  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto(firstUrl);
  await second.goto(secondUrl);
  return { first, second };
}

const getSaved = page => page.evaluate(() => {
  const key = Object.keys(localStorage).find(key => key.startsWith('community-lab-question-review-v1:'));
  return key ? JSON.parse(localStorage.getItem(key)) : {};
});

for (const [title, secondUrl] of [
  ['two different reviewer entries', standaloneUrl],
  ['two tabs of the same reviewer', mainUrl],
]) {
  test(title + ' cannot silently erase edits made in the other tab', async ({ context }) => {
    const { first, second } = await openReviewPages(context, mainUrl, secondUrl);
    const errors = [];
    second.on('pageerror', error => errors.push(error.message));
    await first.locator('#list .card').first().getByLabel(/中文翻译/).fill('合成标签页甲的译文，不是真人审校');
    await expect(first.locator('.statusline')).toContainText('已保存到此设备');
    await second.locator('#list .card').nth(1).getByLabel(/中文翻译/).fill('合成标签页乙的译文，不是真人审校');
    await expect(second.locator('.statusline')).toContainText('其他标签页');
    await expect(second.locator('.statusline')).toContainText('未保存');

    const saved = await getSaved(second);
    expect(saved[firstId].translation).toBe('合成标签页甲的译文，不是真人审校');
    expect(saved[secondId]?.translation).toBeUndefined();

    const [download] = await Promise.all([
      second.waitForEvent('download'),
      second.locator('#export').click(),
    ]);
    const exported = JSON.parse(readFileSync(await download.path(), 'utf8'));
    expect(exported.questions[1].translation_zh_cn).toBe('合成标签页乙的译文，不是真人审校');

    // A new tab loaded from the current storage may safely persist both edits.
    const third = await context.newPage();
    await third.goto(mainUrl);
    await expect(third.locator('#list .card').first().getByLabel(/中文翻译/)).toHaveValue('合成标签页甲的译文，不是真人审校');
    await third.locator('#list .card').nth(1).getByLabel(/中文翻译/).fill('合成新标签页的译文');
    await expect(third.locator('.statusline')).toContainText('已保存');
    const after = await getSaved(third);
    expect(after[firstId].translation).toBe('合成标签页甲的译文，不是真人审校');
    expect(after[secondId].translation).toBe('合成新标签页的译文');
    expect(errors).toEqual([]);
  });
}

test('main reviewer blocks import when another tab has edited the stored draft', async ({ context }) => {
  const { first, second } = await openReviewPages(context);
  const errors = [], messages = [];
  first.on('pageerror', e => errors.push(e.message));
  first.on('dialog', async dialog => { messages.push(dialog.message()); await dialog.accept(); });

  await second.locator('#list .card').first().getByLabel(/中文翻译/).fill('合成其他标签页已经保存');
  await expect(second.locator('.statusline')).toContainText('已保存');

  const incoming = structuredClone(base);
  incoming.questions[0].translation_zh_cn = '合成旧页面试图导入覆盖';
  await first.locator('#import-file').setInputFiles({
    name: 'synthetic-main-import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(incoming)),
  });
  await expect.poll(() => messages.length).toBeGreaterThan(0);
  expect(messages.some(text => text.includes('其他标签页'))).toBe(true);
  const saved = await getSaved(first);
  expect(saved[firstId].translation).toBe('合成其他标签页已经保存');
  expect(errors).toEqual([]);
});
