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
  await expect(page.locator('#full-save-status')).toContainText('已生成本机进度文件');

  // Both the old page and the unsaved-changes warning PR should leave storage opt-in.
  page.on('dialog', dialog => dialog.accept());
  await page.reload();
  await expect(page.locator('#full-select')).toBeVisible();
  await page.locator('[data-start-season="1"]').click();
  await expect(page.locator('#full-count')).toContainText('已答 0 / 87');
  await expectNoHorizontalOverflow(page);
});

test('a new unbacked choice warns on reload, but downloading a backup clears the warning', async ({ page }) => {
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

  dialogs.length = 0;
  await page.reload();
  expect(dialogs).toHaveLength(0);
  await expect(page.locator('#full-select')).toBeVisible();
});
