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

test("all public guest names retain Korean pronunciation in the Chinese directory", async ({ page }) => {
  await page.goto("/the-community-lab/");
  const names = page.locator(".guest-social-person > strong");
  await expect(names).toHaveCount(7);
  for (const name of await names.all()) {
    await expect(name).toHaveAttribute("lang", "ko");
    await expect(name).not.toBeEmpty();
  }
});

test("both review routes keep mixed Korean/Chinese heading text with per-language spans", async ({ page }) => {
  for (const route of ["translation-review", "original-question-translation-review"]) {
    await page.goto(`/the-community-lab/${route}/`);
    const labels = page.locator(".card .label").filter({ hasText: "한국어 원문" });
    await expect(labels).toHaveCount(124);
    for (const label of [labels.first(), labels.last()]) {
      await expect(label).toHaveText("한국어 원문 · 韩文原文");
      await expect(label.locator("span[lang=ko]")).toHaveText("한국어 원문");
      await expect(label.locator("span[lang=zh-CN]")).toHaveCount(0);
    }
    await expect(page.locator(".card .korean[lang=ko]")).toHaveCount(124);
  }
});

test("S1 blank Korean scale levels are not invented; quoted placeholders are tagged Korean", async ({ page }) => {
  await page.goto("/the-community-lab/questionnaire/?season=1");
  await page.locator("#full-choices [role=radio]").first().click();
  await page.locator("#full-next").click();
  const hints = page.locator("#full-choices .full-choice-hint");
  await expect(hints).toHaveCount(2);
  for (const [index, token] of ["2점", "5점"].entries()) {
    const hint = hints.nth(index);
    await expect(hint.locator("span[lang=ko]")).toHaveText(token);
    await expect(hint).toContainText("不是官网原文");
    await expect(hint).toContainText("中文");
  }
  await expect(page.locator("#full-choices .full-choice-ko[lang=zh-CN]")).toHaveCount(2);
  await expect(page.locator("#full-choices [role=radio]")).toHaveCount(6);
  expect(await page.locator("#full-choices [role=radio] .full-choice-mark").allTextContents())
    .toEqual(["1","2","3","4","5","6"]);
});
