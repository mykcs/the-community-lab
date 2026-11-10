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

test('home demo controls enable only after the demo client initializes', async ({ page }) => {
  await page.goto('/the-community-lab/');
  for (const id of ['hero-start', 'start-s1', 'start-s2']) {
    await expect(page.locator('#' + id)).toBeEnabled();
  }
  await expect(page.locator('#demo-boot-status')).toBeHidden();
  await page.locator('#start-s2').click();
  await expect(page.locator('#quiz-view')).toBeVisible();
});

test('home demo controls fail closed when the JavaScript asset is blocked', async ({ page }) => {
  await page.route(/\.(?:m?js)(?:\?.*)?$/, route => route.abort('failed'));
  await page.goto('/the-community-lab/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#demo-boot-status')).toBeVisible();
  await expect(page.locator('#demo-boot-status')).toContainText('脚本未能加载');
  for (const id of ['hero-start', 'start-s1', 'start-s2']) {
    await expect(page.locator('#' + id)).toBeDisabled();
  }
  await expect(page.locator('noscript .demo-noscript')).toBeHidden();
  await expect(page.locator('#demo-boot-status a')).toHaveAttribute('href', '/the-community-lab/translation-review/');
  await expect(page.locator('.season-pilot')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(page.viewportSize().width);
});

test.describe('home with JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });
  test('keeps Korean-Chinese source navigation available without dead demo buttons', async ({ page }) => {
    await page.goto('/the-community-lab/');
    await expect(page.locator('noscript .demo-noscript')).toBeVisible();
    for (const id of ['hero-start', 'start-s1', 'start-s2']) {
      await expect(page.locator('#' + id)).toBeHidden();
    }
    await expect(page.locator('#demo-boot-status')).toBeHidden();
    await expect(page.locator('noscript .demo-noscript a')).toHaveAttribute(
      'href', '/the-community-lab/translation-review/',
    );
    await expect(page.locator('.season-pilot')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(page.viewportSize().width);
  });
});
