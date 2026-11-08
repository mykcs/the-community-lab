import { expect, test } from "@playwright/test";

// WCAG 3.1.2: the document language is Chinese, but visible Korean snippets
// need their own language tag so assistive technology does not read them as
// Chinese. This is only a markup correction: the copy and source values remain.
test("homepage labels Korean text without changing bilingual copy", async ({ page }) => {
  await page.goto("/the-community-lab/");
  for (const text of ["독립 팬 프로젝트", "두 개의 시즌", "한글"]) {
    const korean = page.locator("span[lang=ko]").filter({ hasText: text });
    await expect(korean).toHaveCount(1);
    await expect(korean).toHaveText(text);
  }
  await expect(page.locator(".intro-strip")).toContainText("独立非官方项目");
  await expect(page.locator(".section-topline").filter({ hasText: "两季入口" })).toHaveCount(1);
  await expect(page.locator(".section-topline").filter({ hasText: "中文" })).toHaveCount(1);
});

test("public source questionnaire marks Korean interface and original prompts", async ({ page }) => {
  await page.goto("/the-community-lab/questionnaire/");
  await expect(page.locator(".full-top span[lang=ko]")).toHaveText("한국어");
  await page.locator("[data-start-season=\"2\"]").click();
  await expect(page.locator("#full-ko")).toHaveAttribute("lang", "ko");
  await expect(page.locator("#full-group span[lang=ko]")).toHaveCount(1);
  await expect(page.locator("#full-choices .full-choice-ko[lang=ko]")).toHaveCount(2);
  await expect(page.locator("#full-choices [role=radio]")).toHaveCount(2);
});
