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
    await note.fill('合成更新后的审校备注：已检查更改后的有效文字');
    await status.selectOption('pass');
    await expect(status).toHaveValue('pass');
    expect(errors).toEqual([]);
  });

  test(`${name} invalidates an old pending note when Chinese question or option is edited`, async ({ page }) => {
    await page.goto(route);
    const id = 's1-politics-01';
    const translation = page.getByLabel(`${id} 中文翻译`);
    const option = page.getByLabel(`${id} 选项 1 中文`);
    const note = page.getByLabel(`${id} 审校备注`);
    const status = page.getByLabel(`${id} 复核状态`);

    // A note from BEFORE a text edit cannot justify a PASS for new wording.
    await note.fill('合成旧备注：仅检查过修改前的文字');
    await translation.fill('合成已更改的中文题干');
    await status.selectOption('pass');
    await expect(status).toHaveValue('pending');

    await note.fill('合成更新备注：检查过当前中文题干');
    await status.selectOption('pass');
    await expect(status).toHaveValue('pass');

    // The same gate must protect option captions and invalidate a prior PASS.
    await option.fill('合成已更改的中文选项');
    await expect(status).toHaveValue('pending');
    await status.selectOption('pass');
    await expect(status).toHaveValue('pending');
    await note.fill('合成二次更新备注：检查过最新题干和选项');
    await status.selectOption('pass');
    await expect(status).toHaveValue('pass');
  });

  test(`${name} requires a meaningfully changed note after edited Chinese, not whitespace or undo`, async ({ page }) => {
    await page.goto(route);
    const id = 's1-politics-01';
    const translation = page.getByLabel(`${id} 中文翻译`);
    const note = page.getByLabel(`${id} 审校备注`);
    const status = page.getByLabel(`${id} 复核状态`);
    await note.fill('合成旧备注：只核查过旧版中文');
    await translation.fill('合成新的中文译文：需要重新复核');
    await note.fill('合成旧备注：只核查过旧版中文 '); // whitespace is not new evidence
    await status.selectOption('pass');
    await expect(status).toHaveValue('pending');
    await note.fill('合成新备注：已核对更新后的中文');
    await note.fill('合成旧备注：只核查过旧版中文'); // undo must not make it current
    await status.selectOption('pass');
    await expect(status).toHaveValue('pending');
    await note.fill('合成新备注：已重新核对当前译文和选项');
    await status.selectOption('pass');
    await expect(status).toHaveValue('pass');
    // Another text edit starts a fresh note baseline.
    await translation.fill('合成再次修改的中文译文');
    await note.fill('合成新备注：已重新核对当前译文和选项 ');
    await status.selectOption('pass');
    await expect(status).toHaveValue('pending');
    await note.fill('合成更新备注：核对了再次修改的中文译文');
    await status.selectOption('pass');
    await expect(status).toHaveValue('pass');
  });
}
