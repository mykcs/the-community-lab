import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// A mature WCAG engine catches missing native control names and label-in-name
// regressions that ordinary interaction tests cannot find.
// The CSP bypass belongs only to the test context to load the scanner;
// production scripts, network gates and CSP are unchanged.
test.use({ bypassCSP: true });
const axePath = fileURLToPath(new URL("../node_modules/axe-core/axe.min.js", import.meta.url));

async function assertNoAxeViolations(page) {
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const report = await globalThis.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    });
    return report.violations.map(issue => ({
      rule: issue.id,
      impact: issue.impact,
      targets: issue.nodes.map(node => node.target.join(" ")),
    }));
  });
  expect(violations).toEqual([]);
}

test("home: interactive labels and text contrast meet WCAG A/AA", async ({ page }) => {
  await page.goto("/the-community-lab/");
  await expect(page.getByRole("heading", { name: "从哪一季开始？" })).toBeVisible();
  await assertNoAxeViolations(page);
});

test("source quiz: Korean-first question and AI draft choices remain accessible", async ({ page }) => {
  await page.goto("/the-community-lab/questionnaire/");
  await page.locator("[data-start-season=\"2\"]").click();
  await expect(page.locator("#full-choices [role=radio]")).toHaveCount(2);
  await assertNoAxeViolations(page);
});

test("translation review: filters have meaningful screen-reader names", async ({ page }) => {
  await page.goto(new URL("../docs/translation-review/index.html", import.meta.url).href);
  await expect(page.getByRole("combobox", { name: "筛选季别" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "筛选题组维度" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "筛选复核状态" })).toBeVisible();
  await assertNoAxeViolations(page);
});
