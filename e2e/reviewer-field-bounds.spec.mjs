import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// The offline reviewer must not produce data that its own importer rejects.
// These are synthetic review fields, never third-party questionnaire answers.
const pages = [
  ['translation review', new URL('../docs/translation-review/index.html', import.meta.url).href],
  ['standalone translation review', new URL('../docs/original-question-translation-review/index.html', import.meta.url).href],
];
const id = 's1-politics-01';
for (const [name, route] of pages) {
  test(`${name} constrains editable fields to its offline import limits`, async ({ page, browser }) => {
    await page.goto(route);
    for (const [label, bound] of [
      [' 中文翻译', 20000],
      [' 选项 1 中文', 4000],
      [' 审校备注', 4000],
    ]) {
      const field = page.getByLabel(id + label);
      await expect(field).toHaveAttribute('maxlength', String(bound));
      await field.evaluate((element, length) => {
        element.value = '合'.repeat(length);
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }, bound);
      await field.press('End');
      await field.press('x');
      expect((await field.inputValue()).length, `limit for ${label}`).toBe(bound);
    }

    // Full-boundary export must be importable into a fresh reviewer session.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#export').click(),
    ]);
    const buffer = await readFile(await download.path());
    const record = JSON.parse(buffer.toString('utf8'));
    const question = record.questions.find(item => item.id === id);
    expect(question.translation_zh_cn.length).toBe(20000);
    expect(question.options[0].zh_cn.length).toBe(4000);
    expect(question.human_review_note.length).toBe(4000);

    const context = await browser.newContext();
    try {
      const restored = await context.newPage();
      restored.on('dialog', dialog => dialog.accept());
      await restored.goto(pages[0][1]);
      await restored.locator('#import-file').setInputFiles({
        name: 'synthetic-review-boundary.json',
        mimeType: 'application/json',
        buffer,
      });
      await expect(restored.locator('.statusline')).toContainText('已从同一来源版本恢复');
      expect((await restored.getByLabel(id + ' 中文翻译').inputValue()).length).toBe(20000);
      expect((await restored.getByLabel(id + ' 选项 1 中文').inputValue()).length).toBe(4000);
      expect((await restored.getByLabel(id + ' 审校备注').inputValue()).length).toBe(4000);
    } finally {
      await context.close();
    }
  });
}

for (const [name, route] of pages) {
  test(`${name} retains an oversized legacy note and rejects unusable export`, async ({ page }) => {
    await page.goto(route);
    await page.getByLabel(id + ' 审校备注').fill('fictional-review-note');
    await page.evaluate(questionId => {
      const storageKey = Object.keys(localStorage)
        .find(value => value.startsWith('community-lab-question-review-v1:'));
      if (!storageKey) throw new Error('Expected a locally saved reviewer draft');
      const drafts = JSON.parse(localStorage.getItem(storageKey));
      drafts[questionId].note = '合'.repeat(4001); // pre-limit local draft
      localStorage.setItem(storageKey, JSON.stringify(drafts));
    }, id);
    await page.reload();
    const note = page.getByLabel(id + ' 审校备注');
    expect((await note.inputValue()).length).toBe(4001);
    const warnings = [];
    let downloaded = false;
    page.on('dialog', dialog => {
      warnings.push(dialog.message());
      return dialog.accept();
    });
    page.on('download', () => { downloaded = true; });
    await page.locator('#export').click();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('导出已阻止');
    expect(downloaded).toBe(false);
    await page.reload();
    expect((await page.getByLabel(id + ' 审校备注').inputValue()).length).toBe(4001);
    await page.getByLabel(id + ' 审校备注').fill('合'.repeat(4000));
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#export').click(),
    ]);
    const record = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(record.questions.find(item => item.id === id).human_review_note.length).toBe(4000);
  });
}
