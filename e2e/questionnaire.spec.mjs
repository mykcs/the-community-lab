import { expect, test } from '@playwright/test';

async function expectNoHorizontalOverflow(page) {
  const width = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(width.page, `page width ${width.page}px should fit ${width.viewport}px viewport`).toBeLessThanOrEqual(width.viewport + 1);
}

test('public routes render without horizontal overflow', async ({ page }) => {
  await page.goto('/the-community-lab/');
  await expect(page.locator('a[href="/the-community-lab/questionnaire/?season=2"]').first()).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto('/the-community-lab/questionnaire/');
  await expect(page.locator('#full-select')).toBeVisible();
  await expect(page.locator('[data-start-season="2"]')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('each non-official source question shows a pinned client digest without claiming a scoring version', async ({ page }) => {
  const sourceDigest = '59a67f9d1e0049156bedfe4d61a4cf8511dc8903ba80cf297b6bffad3c2b379e';
  for (const season of [1, 2]) {
    await page.goto(`/the-community-lab/questionnaire/?season=${season}`);
    await expect(page.locator('#full-source-fingerprint')).toHaveText(`${sourceDigest} · 2026-10-30`);
    await expect(page.locator('#full-source')).toHaveAttribute('href', `https://thecommunity.co.kr/season/${season}/test`);
    await expect(page.locator('.full-evidence')).toContainText('这不是官方题库或计分版本号');
    await expectNoHorizontalOverflow(page);
  }
});

test('season two answers, navigation, and in-memory resume work', async ({ page }) => {
  await page.goto('/the-community-lab/questionnaire/');
  await page.locator('[data-start-season="2"]').click();
  await expect(page.locator('#full-count')).toContainText('已答 0 / 37');
  await expect(page.locator('.full-choice')).toHaveCount(2);
  await expectNoHorizontalOverflow(page);

  await page.locator('.full-choice').first().click();
  await expect(page.locator('#full-count')).toContainText('已答 1 / 37');
  await expect(page.locator('.full-choice').first()).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#full-next').click();
  await expect(page.locator('#full-position')).toContainText('第 02 / 37 题');
  await page.locator('#full-prev').click();
  await expect(page.locator('.full-choice').first()).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#full-exit').click();
  await expect(page.locator('#full-select')).toBeVisible();
  await expect(page.locator('[data-season-progress="2"]')).toContainText('1 / 37');
  await page.locator('[data-start-season="2"]').click();
  await expect(page.locator('#full-count')).toContainText('已答 1 / 37');
  await expectNoHorizontalOverflow(page);
});

test('season one local download works and a reload never restores it automatically', async ({ page }) => {
  await page.goto('/the-community-lab/questionnaire/');
  await page.locator('[data-start-season="1"]').click();
  await expect(page.locator('#full-save')).toBeDisabled();
  await page.locator('.full-choice').first().click();
  await expect(page.locator('#full-count')).toContainText('已答 1 / 87');
  await expect(page.locator('#full-save')).toBeEnabled();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#full-save').click(),
  ]);
  expect(download.suggestedFilename()).toBe('community-private-season-1-progress.json');
  await expect(page.locator('#full-save-status')).toContainText('已请求浏览器下载');
  await expect(page.locator('#full-confirm-progress-backup')).toBeVisible();

  // Both the old page and the unsaved-changes warning PR should leave storage opt-in.
  page.on('dialog', dialog => dialog.accept());
  await page.reload();
  await expect(page.locator('#full-select')).toBeVisible();
  await page.locator('[data-start-season="1"]').click();
  await expect(page.locator('#full-count')).toContainText('已答 0 / 87');
  await expectNoHorizontalOverflow(page);
});

test('requesting a download does not clear a private-data warning until the visitor confirms the file exists', async ({ page }) => {
  await page.goto('/the-community-lab/questionnaire/');
  await page.locator('[data-start-season="2"]').click();
  await page.locator('.full-choice').first().click();

  const dialogs = [];
  page.on('dialog', dialog => {
    dialogs.push(dialog.type());
    void dialog.accept();
  });
  await page.reload();
  expect(dialogs).toEqual(['beforeunload']);
  await expect(page.locator('#full-select')).toBeVisible();

  await page.locator('[data-start-season="2"]').click();
  await page.locator('.full-choice').first().click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#full-save').click(),
  ]);
  expect(download.suggestedFilename()).toBe('community-private-season-2-progress.json');
  await expect(page.locator('#full-confirm-progress-backup')).toBeVisible();
  await expect(page.locator('#full-save-status')).toContainText('请先核对 JSON 文件确实保存');
  dialogs.length = 0;
  await page.reload();
  expect(dialogs).toEqual(['beforeunload']);

  await page.locator('[data-start-season="2"]').click();
  await page.locator('.full-choice').first().click();
  const [confirmedDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#full-save').click(),
  ]);
  expect(confirmedDownload.suggestedFilename()).toBe('community-private-season-2-progress.json');
  await page.locator('#full-confirm-progress-backup').click();
  await expect(page.locator('#full-save-status')).toContainText('已按你的确认标记为已备份');
  dialogs.length = 0;
  await page.reload();
  expect(dialogs).toHaveLength(0);
  await expect(page.locator('#full-select')).toBeVisible();
});

test('an edit after a requested download invalidates the old backup confirmation', async ({ page }) => {
  await page.goto('/the-community-lab/questionnaire/?season=2');
  await page.locator('.full-choice').first().click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#full-save').click(),
  ]);
  expect(download.suggestedFilename()).toBe('community-private-season-2-progress.json');
  await expect(page.locator('#full-confirm-progress-backup')).toBeVisible();
  await page.locator('#full-next').click();
  await page.locator('.full-choice').first().click();
  await expect(page.locator('#full-confirm-progress-backup')).toBeHidden();
  const dialogs = [];
  page.on('dialog', dialog => { dialogs.push(dialog.type()); void dialog.accept(); });
  await page.reload();
  expect(dialogs).toEqual(['beforeunload']);
});
