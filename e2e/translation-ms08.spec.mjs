import { expect, test } from "@playwright/test";
import { loadFullQuestionnaire } from "../scripts/load-full-questionnaire.mjs";
import { createPrivateProgressReceipt } from "../lib/full-questionnaire.mjs";

test("S2 ms08 AI modal copy keeps Korean before Chinese and original O/X options", async ({ page }) => {
  const pack = loadFullQuestionnaire();
  const position = pack.seasons[2].findIndex(q => q.id === "ms08");
  expect(position).toBeGreaterThanOrEqual(0);
  const question = pack.seasons[2][position];
  const blank = createPrivateProgressReceipt(pack, 2, {}, position);
  const posts = [];
  page.on("request", request => { if (request.method() === "POST") posts.push(request.url()); });

  await page.goto("/the-community-lab/questionnaire/");
  await page.locator("#full-import-file").setInputFiles({
    name: "synthetic-empty-progress.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(blank)),
  });
  await expect(page.locator("#full-quiz")).toBeVisible();
  await expect(page.locator("#full-group")).toContainText("ms08");
  await expect(page.locator("#full-ko")).toHaveText(question.sourceKo);
  await expect(page.locator("#full-ko")).toHaveAttribute("lang", "ko");
  await expect(page.locator("#full-zh")).toHaveText(
    "即使是有些腐败的政治人物，只要能增加我的资产，我也可以投票支持他。",
  );
  const korean = await page.locator("#full-ko").boundingBox();
  const chinese = await page.locator("#full-zh").boundingBox();
  expect(chinese.y).toBeGreaterThan(korean.y);
  await expect(page.locator("#full-choices > button")).toHaveCount(2);
  await expect(page.locator("#full-choices > button").first()).toContainText("O");
  await expect(page.locator("#full-choices > button").last()).toContainText("X");
  await page.locator("#full-choices > button").first().click();
  await expect(page.locator("#full-choices > button").first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#full-count")).toContainText("已答 1 / 37");
  const scroll = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth, viewport: innerWidth,
  }));
  expect(scroll.width).toBeLessThanOrEqual(scroll.viewport + 1);
  expect(posts).toEqual([]);
});
