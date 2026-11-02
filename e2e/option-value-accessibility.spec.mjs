import { expect, test } from "@playwright/test";
import { loadFullQuestionnaire } from "../scripts/load-full-questionnaire.mjs";

const pack = loadFullQuestionnaire();

for (const season of [2, 1]) {
  test(`season ${season} exposes original choice values to screen readers, Korean before Chinese`, async ({ page }) => {
    // These are already published source-draft values, NOT official scores.
    const first = pack.seasons[season][0];
    await page.goto(`/the-community-lab/questionnaire/?season=${season}`);
    const choices = page.locator(".full-choice");
    await expect(choices).toHaveCount(first.options.length);

    for (const [index, option] of first.options.entries()) {
      const button = choices.nth(index);
      const ko = button.locator(".full-choice-ko");
      const zh = button.locator(".full-choice-zh");
      const visibleMark = button.locator(".full-choice-mark");
      await expect(visibleMark).toHaveText(String(option.value));
      await expect(ko).toHaveAttribute("lang", "ko");
      await expect(ko).toHaveText(option.ko);
      await expect(zh).toHaveText(option.zh);
      // An overriding aria-label loses the source O/X or scale value AND
      // the nested Korean language metadata in assistive technology.
      await expect(button).not.toHaveAttribute("aria-label", /.+/);
      await expect(visibleMark).not.toHaveAttribute("aria-hidden", "true");
      const accessibleName = [String(option.value), option.ko, option.zh].join(" ");
      await expect(button).toHaveAccessibleName(accessibleName);
    }
    await choices.first().click();
    await expect(choices.first()).toHaveAttribute("aria-pressed", "true");
    await expect(choices.last()).toHaveAttribute("aria-pressed", "false");
  });
}
