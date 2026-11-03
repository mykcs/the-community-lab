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
    await expect(choices.first()).toHaveAttribute("aria-checked", "true");
    await expect(choices.last()).toHaveAttribute("aria-checked", "false");
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



for (const season of [1, 2]) {
  test(`season ${season} announces the Korean and Chinese question in the answer group's accessible name`, async ({ page }) => {
    const question = pack.seasons[season][0];
    await page.goto(`/the-community-lab/questionnaire/?season=${season}`);
    const group = page.getByRole('radiogroup');
    // The previous generic label omitted both question texts. People moving
    // between answer groups with assistive technology need the current question.
    await expect(group).toHaveAttribute('aria-labelledby', 'full-ko full-zh full-choice-prompt');
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await expect(group).toHaveAccessibleName(new RegExp(escape(question.sourceKo)));
    await expect(group).toHaveAccessibleName(new RegExp(escape(question.draftZh)));
    await expect(group).toHaveAccessibleName(/请选择一个/);
    await expect(page.locator('#full-ko')).toHaveAttribute('lang', 'ko');

    await page.locator('.full-choice').first().click();
    await page.locator('#full-next').click();
    const nextQuestion = pack.seasons[season][1];
    await expect(group).toHaveAccessibleName(new RegExp(escape(nextQuestion.draftZh)));
    await expect(group).not.toHaveAccessibleName(new RegExp(escape(question.draftZh)));
    // The question-context fix must not change the source option selection.
    await expect(group.getByRole('radio')).toHaveCount(nextQuestion.options.length);
  });
}

test('S2 radio options expose one keyboard tab stop, arrow keys select a source value and back navigation retains it', async ({ page }) => {
  await page.setViewportSize({ width: 440, height: 956 });
  await page.goto('/the-community-lab/questionnaire/?season=2');
  const group = page.getByRole('radiogroup', { name: /请选择一个/ });
  await expect(group).toBeVisible();
  const radio = group.getByRole('radio');
  await expect(radio).toHaveCount(2);
  await expect(radio.nth(0)).toHaveAttribute('tabindex', '0');
  await expect(radio.nth(1)).toHaveAttribute('tabindex', '-1');
  await radio.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  await expect(radio.nth(1)).toBeFocused();
  await expect(radio.nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(radio.nth(0)).toHaveAttribute('tabindex', '-1');
  await expect(radio.nth(1)).toHaveAttribute('tabindex', '0');
  await page.locator('#full-next').click();
  await page.locator('#full-prev').click();
  const revisit = page.getByRole('radiogroup').getByRole('radio');
  await expect(revisit.nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(revisit.nth(1)).toHaveAttribute('tabindex', '0');
  await revisit.nth(1).focus();
  await page.keyboard.press('ArrowDown'); // Wrap to the first source value.
  await expect(revisit.nth(0)).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(440);
});

test('S1 six-option source scale has one checked radio and retains all six numeric IDs under keyboard interaction', async ({ page }) => {
  await page.goto('/the-community-lab/questionnaire/?season=1');
  await page.locator('.full-choice').first().click(); // Q1 is 4-option.
  await page.locator('#full-next').click();
  const radio = page.getByRole('radiogroup').getByRole('radio');
  await expect(radio).toHaveCount(6);
  for (let i = 0; i < 6; i++) {
    await expect(radio.nth(i).locator('.full-choice-mark')).toHaveText(String(i + 1));
  }
  await radio.nth(0).focus();
  await page.keyboard.press('ArrowLeft'); // Wrap to position 6.
  await expect(radio.nth(5)).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#full-next')).toBeEnabled();
  await page.keyboard.press('Home');
  await expect(radio.nth(0)).toHaveAttribute('aria-checked', 'true');
});
