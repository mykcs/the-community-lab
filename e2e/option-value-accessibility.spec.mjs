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
      const numericOnly = season === 1 && first.options.length === 6 &&
        (option.value === 2 || option.value === 5) &&
        option.ko === '';
      await expect(ko).toHaveAttribute('lang', numericOnly ? 'zh-CN' : 'ko');
      await expect(ko).toHaveText(numericOnly ? '当前客户端此档无韩文文字标签' : option.ko);
      const friendly = numericOnly
        ? `${option.value === 2 ? '反对侧' : '赞同侧'} · 第 ${option.value} 档`
        : option.zh;
      await expect(zh).toHaveText(friendly);
      const hint = button.locator('.full-choice-hint');
      if (numericOnly) {
        await expect(hint).toContainText(`旧 AI 草稿中的“${option.value}점”`);
        await expect(hint).toContainText('没有韩文文字标签');
        await expect(hint).toContainText('不是官网原文');
        await expect(hint).toContainText('不是官网命名');
      } else {
        await expect(hint).toHaveCount(0);
      }
      // An overriding aria-label loses the source O/X or scale value AND
      // the nested Korean language metadata in assistive technology.
      await expect(button).not.toHaveAttribute("aria-label", /.+/);
      await expect(visibleMark).not.toHaveAttribute("aria-hidden", "true");
      const accessibleName = [String(option.value),
        numericOnly ? '当前客户端此档无韩文文字标签' : option.ko, friendly,
        ...(numericOnly ? [`当前冻结客户端此档没有韩文文字标签；旧 AI 草稿中的“${option.value}점”仅是本站按档位填写的占位，不是官网原文。原中文初译为“${option.zh}”；方向是本站根据六级顺序的辅助说明，不是官网命名。`] : []),
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
    await expect(button.locator('.full-choice-ko')).toHaveText('当前客户端此档无韩文文字标签');
    await expect(button.locator('.full-choice-ko')).toHaveAttribute('lang', 'zh-CN');
    await expect(button.locator('.full-choice-zh')).toHaveText(`${value === 2 ? '反对侧' : '赞同侧'} · 第 ${value} 档`);
    await expect(button.locator('.full-choice-hint')).toContainText(`旧 AI 草稿中的“${opt.value}점”`);
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

test('S1 four-option keyboard navigation follows desktop columns and mobile source order', async ({ page }) => {
  await page.goto('/the-community-lab/questionnaire/?season=1');
  const narrow = page.viewportSize().width <= 630;
  const radio = page.getByRole('radiogroup').getByRole('radio');
  await expect(radio).toHaveCount(4);
  await radio.nth(0).focus();
  for (const [key, index] of [
    ['ArrowRight', narrow ? 1 : 2],
    ['ArrowDown', narrow ? 2 : 3],
    ['ArrowLeft', 1],
    ['ArrowUp', 0],
  ]) {
    await page.keyboard.press(key);
    await expect(radio.nth(index)).toBeFocused();
    await expect(radio.nth(index)).toHaveAttribute('aria-checked', 'true');
    await expect(radio.nth(index)).toHaveAttribute('tabindex', '0');
  }
});

test('S1 six-option keyboard arrows match visible columns without remapping original source values', async ({ page }) => {
  await page.goto('/the-community-lab/questionnaire/?season=1');
  const narrow = page.viewportSize().width <= 630;
  await page.locator('.full-choice').first().click(); // Q1 is 4-option.
  await page.locator('#full-next').click();
  const radio = page.getByRole('radiogroup').getByRole('radio');
  await expect(radio).toHaveCount(6);
  for (let i = 0; i < 6; i++) {
    await expect(radio.nth(i).locator('.full-choice-mark')).toHaveText(String(i + 1));
  }
  await radio.nth(0).focus();
  for (const [key, index] of [
    ['ArrowRight', narrow ? 1 : 3],
    ['ArrowDown', narrow ? 2 : 4],
    ['ArrowLeft', 1],
    ['ArrowUp', 0],
    ['ArrowLeft', narrow ? 5 : 3], // Wrap in the visible row/column.
    ['End', 5],
    ['Home', 0],
  ]) {
    await page.keyboard.press(key);
    await expect(radio.nth(index)).toBeFocused();
    await expect(radio.nth(index)).toHaveAttribute('aria-checked', 'true');
    await expect(radio.nth(index)).toHaveAttribute('tabindex', '0');
    await expect(radio.nth(index).locator('.full-choice-mark')).toHaveText(String(index + 1));
  }
  await expect(page.locator('#full-next')).toBeEnabled();
});
