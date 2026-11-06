import { expect, test } from '@playwright/test';

// Synthetic self-reported reviewer notes only. No real participant data,
// human credential or official questionnaire request is involved.
const pages = [
  ['main', new URL('../docs/translation-review/index.html', import.meta.url).href],
  ['standalone', new URL('../docs/original-question-translation-review/index.html', import.meta.url).href],
];

for (const [name, route] of pages) {
  test(`${name} reviewer reopens stale PASS without losing local edits and notes`, async ({ page }) => {
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.goto(route);
    const status = page.getByLabel('rp03 复核状态');
    const note = page.getByLabel('rp03 审校备注');
    const translation = page.getByLabel('rp03 中文翻译');
    const draft = (await translation.inputValue()) + ' [本地合成译文修改]';
    await translation.fill(draft);
    const reviewNote = '合成审校代号 / 语言能力测试依据 / 2026-11-06';
    await note.fill(reviewNote);
    await status.selectOption('pass');
    await expect(status).toHaveValue('pass');
    await page.reload();
    await expect(page.getByLabel('rp03 复核状态')).toHaveValue('pass');

    // Simulate a later repository draft revision. Its previous client SHA
    // would still match, but its bilingual baseline must not be trusted.
    await page.evaluate(() => {
      const pack = JSON.parse(document.querySelector('#embedded-data').textContent);
      const key = 'community-lab-question-review-v1:' + pack.source.asset_sha256;
      const edits = JSON.parse(localStorage.getItem(key));
      edits.rp03.reviewedBaselineSnapshot = 'synthetic-outdated-bilingual-draft';
      localStorage.setItem(key, JSON.stringify(edits));
    });
    await page.reload();
    await expect(page.getByLabel('rp03 复核状态')).toHaveValue('pending');
    await expect(page.getByLabel('rp03 审校备注')).toHaveValue(reviewNote);
    await expect(page.getByLabel('rp03 中文翻译')).toHaveValue(draft);

    await page.getByLabel('rp03 复核状态').selectOption('pass');
    await expect(page.getByLabel('rp03 复核状态')).toHaveValue('pending');
    await page.getByLabel('rp03 审校备注').fill('合成重新核验说明 / 韩中审校资格待另行核实 / 2026-11-06');
    await page.getByLabel('rp03 复核状态').selectOption('pass');
    await expect(page.getByLabel('rp03 复核状态')).toHaveValue('pass');
    await page.reload();
    await expect(page.getByLabel('rp03 复核状态')).toHaveValue('pass');
    expect(failures).toEqual([]);
  });
}
