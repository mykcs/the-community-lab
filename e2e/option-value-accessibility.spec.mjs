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
      const numericOnly = season === 1 && first.options.length === 6 &&
        (option.value === 2 || option.value === 5) &&
        (option.ko === '2점' || option.ko === '5점');
      const friendly = numericOnly
        ? `${option.value === 2 ? '反对侧' : '赞同侧'} · 第 ${option.value} 档`
        : option.zh;
      await expect(zh).toHaveText(friendly);
      const hint = button.locator('.full-choice-hint');
      if (numericOnly) {
        await expect(hint).toContainText(`中文直译：${option.zh}`);
        await expect(hint).toContainText('不是官网命名');
      } else {
        await expect(hint).toHaveCount(0);
      }
      // An overriding aria-label loses the source O/X or scale value AND
      // the nested Korean language metadata in assistive technology.
      await expect(button).not.toHaveAttribute("aria-label", /.+/);
      await expect(visibleMark).not.toHaveAttribute("aria-hidden", "true");
      const accessibleName = [String(option.value), option.ko, friendly,
        ...(numericOnly ? [`中文直译：${option.zh}。方向是根据六级顺序的辅助说明，不是官网命名。`] : []),
      ].join(" ");
      await expect(button).toHaveAccessibleName(accessibleName);
    }
    await choices.first().click();
    await expect(choices.first()).toHaveAttribute("aria-pressed", "true");
    await expect(choices.last()).toHaveAttribute("aria-pressed", "false");
  });
}

test('S1 six-step scale is grouped by direction on desktop but stays a single readable column on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/the-community-lab/questionnaire/?season=1');
  const choices = page.locator('.full-choice');
  // First S1 questions use four options. Navigate to a real six-option
  // question rather than assuming page position 1 already has six.
  const sixPosition = pack.seasons[1].findIndex(q => q.options.length === 6);
  expect(sixPosition).toBeGreaterThanOrEqual(0);
  for (let i = 0; i < sixPosition; i++) {
    await choices.first().click();
    await page.locator('#full-next').click();
  }
  const question = pack.seasons[1][sixPosition];
  await expect(choices).toHaveCount(6);
  for (const value of [2, 5]) {
    const opt = question.options.find(option => option.value === value);
    expect(opt).toBeTruthy();
    const button = choices.filter({ has: page.locator('.full-choice-mark', { hasText: String(value) }) });
    await expect(button).toHaveCount(1);
    await expect(button.locator('.full-choice-ko')).toHaveText(opt.ko);
    await expect(button.locator('.full-choice-zh')).toHaveText(`${value === 2 ? '反对侧' : '赞同侧'} · 第 ${value} 档`);
    await expect(button.locator('.full-choice-hint')).toContainText(`中文直译：${opt.zh}`);
  }
  const positions = await choices.evaluateAll(elements => elements.map(el => {
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width };
  }));
  for (let i = 1; i < 3; i++) {
    expect(positions[i].x).toBe(positions[0].x);
    expect(positions[i].y).toBeGreaterThan(positions[i - 1].y);
  }
  for (let i = 3; i < 6; i++) expect(positions[i].x).toBeGreaterThan(positions[0].x);
  await page.setViewportSize({ width: 440, height: 956 });
  const narrow = await choices.evaluateAll(elements => elements.map(el => {
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y };
  }));
  for (let i = 1; i < narrow.length; i++) {
    expect(narrow[i].x).toBe(narrow[0].x);
    expect(narrow[i].y).toBeGreaterThan(narrow[i - 1].y);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(440);
});
