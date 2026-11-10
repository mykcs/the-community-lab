import { expect, test } from "@playwright/test";

test.describe("questionnaire with JavaScript disabled", () => {
  test.use({ javaScriptEnabled: false });

  test("warns before any dead quiz controls and gives a working exit", async ({ page }) => {
    await page.goto("/the-community-lab/questionnaire/");
    const notice = page.locator("noscript .full-script-warning");
    await expect(notice).toBeVisible();
    await expect(notice).toBeInViewport();
    await expect(notice).toContainText("无法在本机作答");
    await expect(notice).toContainText("JavaScript");
    await expect(page.locator("[data-start-season=\"1\"]")).toBeHidden();
    await expect(page.locator("[data-start-season=\"2\"]")).toBeHidden();
    await expect(page.locator("#full-import")).toBeHidden();
    const home = notice.getByRole("link", { name: "返回首页" });
    await expect(home).toBeVisible();
    await expect(home).toHaveAttribute("href", "/the-community-lab/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(page.viewportSize().width);
    await home.click();
    await expect(page).toHaveURL(/\/the-community-lab\/$/);
  });
});

test("JavaScript-enabled visitors still get usable season buttons", async ({ page }) => {
  await page.goto("/the-community-lab/questionnaire/");
  await expect(page.locator("noscript .full-script-warning")).toBeHidden();
  await expect(page.locator('[data-start-season="2"]')).toBeVisible();
  await expect(page.locator('[data-start-season="1"]')).toBeVisible();
  await expect(page.locator('[data-start-season="1"]')).toBeEnabled();
  await expect(page.locator('[data-start-season="2"]')).toBeEnabled();
  await expect(page.locator('#full-import')).toBeEnabled();
  await expect(page.locator('#full-boot-status')).toBeHidden();
  await page.locator('[data-start-season="2"]').click();
  await expect(page.locator("#full-quiz")).toBeVisible();
  await expect(page.locator("#full-choices .full-choice")).toHaveCount(2);
});

test("when the browser cannot load the JS bundle, source quiz controls fail closed with a visible exit", async ({ page }) => {
  // This is different from disabling JavaScript: e.g., a blocked/broken asset
  // leaves <noscript> hidden, but must not leave apparently usable dead buttons.
  await page.route(/\.(?:m?js)(?:\?.*)?$/, route => route.abort("failed"));
  await page.goto("/the-community-lab/questionnaire/", { waitUntil: "domcontentloaded" });
  const warning = page.locator("#full-boot-status");
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("答题脚本尚未成功运行");
  await expect(page.locator('[data-start-season="1"]')).toBeDisabled();
  await expect(page.locator('[data-start-season="2"]')).toBeDisabled();
  await expect(page.locator("#full-import")).toBeDisabled();
  await expect(page.locator("noscript .full-script-warning")).toBeHidden();
  const home = warning.getByRole("link", { name: "返回首页" });
  await expect(home).toHaveAttribute("href", "/the-community-lab/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(page.viewportSize().width);
});
