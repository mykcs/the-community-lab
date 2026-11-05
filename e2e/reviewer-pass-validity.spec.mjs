import { expect, test } from '@playwright/test';

// Synthetic edits only. Neither page may self-report a review pass with
// an empty Chinese question or option: that JSON cannot survive import.
const routes = [
  ['Pages reviewer', new URL('../docs/translation-review/index.html', import.meta.url).href],
  ['standalone reviewer', new URL('../docs/original-question-translation-review/index.html', import.meta.url).href],
];

for (const [name, route] of routes) {
  test(`${name} refuses self-reported pass for blank Chinese text`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(route);
    const questionId = 's1-politics-01';
    const translation = page.getByLabel(`${questionId} 中文翻译`);
    const option = page.getByLabel(`${questionId} 选项 1 中文`);
    const note = page.getByLabel(`${questionId} 审校备注`);
    const status = page.getByLabel(`${questionId} 复核状态`);

    await note.fill('合成审校备注 · 韩中能力和日期仅供测试');
    await translation.fill('   ');
    await status.selectOption('pass');
    await expect(status).toHaveValue('pending');

    await translation.fill('合成中文译文，仅用于回归测试');
    await option.fill('  ');
    await status.selectOption('pass');
    await expect(status).toHaveValue('pending');

    await option.fill('合成中文选项，仅用于回归测试');
    await status.selectOption('pass');
    await expect(status).toHaveValue('pass');
    expect(errors).toEqual([]);
  });
}
