import { expect, test } from '@playwright/test';

test('home brand points at a real visible landmark and works after demo navigation', async ({ page }) => {
  await page.goto('/the-community-lab/');

  const brand = page.locator('.site-header .brand');
  const anchor = await brand.getAttribute('href');
  expect(anchor).toBe('#home-view');
  await expect(page.locator(anchor)).toBeVisible();

  // The brand remains useful from the page's lower sections, not just at load.
  await page.locator('#guest-social').scrollIntoViewIfNeeded();
  await brand.click();
  await expect(page).toHaveURL(/#home-view$/);
  await expect(page.locator('#hero-title')).toBeVisible();

  // A demo session is in-memory and must survive the shared header navigation.
  await page.locator('#hero-start').click();
  await page.locator('#answer-options button').first().click();
  await expect(page.locator('#quiz-percent')).toContainText('已答 1 / 6');
  await brand.click();
  await expect(page.locator('#home-view')).toBeVisible();
  await expect(page.locator('#quiz-view')).toBeHidden();
  await expect(page).toHaveURL(/#home-view$/);
  await page.locator('#hero-start').click();
  await expect(page.locator('#quiz-percent')).toContainText('已答 1 / 6');

  // Header section links must also unhide their target when a quiz is open.
  await page.locator('.header-links a[href="#guest-social"]').click();
  await expect(page.locator('#home-view')).toBeVisible();
  await expect(page.locator('#guest-social')).toBeVisible();
  await expect(page).toHaveURL(/#guest-social$/);
});
