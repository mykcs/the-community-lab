import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// All records below are fictional *self-reported* review notes. A PASS does
// not establish bilingual competence, licensing or official questionnaire parity.
const routes = [
  ['main reviewer', new URL('../docs/translation-review/index.html', import.meta.url).href],
  ['standalone reviewer', new URL('../docs/original-question-translation-review/index.html', import.meta.url).href],
];
const mainReview = routes[0][1];
const id = 's1-politics-01'; // Six-step scale with genuinely blank Korean 2/5 captions.
const captionRevision = 's1-scale-empty-2-and-5@1';
const syntheticNote = '合成审校备注：本机复核了空白韩文 2/5 档位；仅供回归测试';

async function exportSyntheticPass(page, sourceUrl) {
  await page.goto(sourceUrl);
  await page.getByLabel(id + ' 审校备注').fill(syntheticNote);
  await page.getByLabel(id + ' 复核状态').selectOption('pass');
  await expect(page.getByLabel(id + ' 复核状态')).toHaveValue('pass');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export').click(),
  ]);
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(exported.questions.find(q => q.id === id).human_review_source_caption_revision).toBe(captionRevision);
  return exported;
}

async function importIntoFreshPage(browser, record) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const alerts = [];
  page.on('dialog', async dialog => { alerts.push(dialog.type() + ': ' + dialog.message()); await dialog.accept(); });
  await page.goto(mainReview);
  await page.locator('#import-file').setInputFiles({
    name: 'synthetic-six-step-review.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(record)),
  });
  return { context, page, alerts };
}

for (const [label, route] of routes) {
  test(`${label} preserves corrected S1 six-step self-reported PASS across export, import and reload`, async ({ page, browser }) => {
    const record = await exportSyntheticPass(page, route);
    const restored = await importIntoFreshPage(browser, record);
    try {
      await expect(restored.page.locator('.statusline')).toContainText('已从同一来源版本恢复');
      await expect(restored.page.getByLabel(id + ' 复核状态')).toHaveValue('pass');
      await restored.page.reload();
      await expect(restored.page.getByLabel(id + ' 复核状态')).toHaveValue('pass');
      expect(restored.alerts.filter(entry => entry.startsWith('alert:'))).toEqual([]);
    } finally { await restored.context.close(); }
  });
}

test('legacy six-step PASS without source-caption revision proof is downgraded, not falsely approved', async ({ page, browser }) => {
  const record = await exportSyntheticPass(page, mainReview);
  delete record.questions.find(q => q.id === id).human_review_source_caption_revision;
  const restored = await importIntoFreshPage(browser, record);
  try {
    await expect(restored.page.locator('.statusline')).toContainText('已从同一来源版本恢复');
    await expect(restored.page.getByLabel(id + ' 复核状态')).toHaveValue('pending');
    await restored.page.reload();
    await expect(restored.page.getByLabel(id + ' 复核状态')).toHaveValue('pending');
    await restored.page.getByLabel(id + ' 复核状态').selectOption('pass');
    await expect(restored.page.getByLabel(id + ' 复核状态')).toHaveValue('pending');
    await restored.page.getByLabel(id + ' 审校备注').fill('合成重新审校：确认空白韩文档位与当前选项');
    await restored.page.getByLabel(id + ' 复核状态').selectOption('pass');
    await expect(restored.page.getByLabel(id + ' 复核状态')).toHaveValue('pass');
    expect(restored.alerts.filter(entry => entry.startsWith('alert:'))).toEqual([]);
  } finally { await restored.context.close(); }
});

test('fabricated source-caption revision in imported reviewer file fails closed', async ({ page, browser }) => {
  const record = await exportSyntheticPass(page, mainReview);
  record.questions.find(q => q.id === id).human_review_source_caption_revision = 'fabricated-version';
  const restored = await importIntoFreshPage(browser, record);
  try {
    await expect.poll(() => restored.alerts.length).toBe(1);
    expect(restored.alerts[0]).toContain('韩文量表修订证据无效');
    await expect(restored.page.getByLabel(id + ' 复核状态')).toHaveValue('pending');
    await restored.page.reload();
    await expect(restored.page.getByLabel(id + ' 复核状态')).toHaveValue('pending');
  } finally { await restored.context.close(); }
});
