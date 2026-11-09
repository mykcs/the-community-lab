import { expect, test } from '@playwright/test';

// WCAG 3.1.2: Chinese reviewer explanations sometimes quote Korean terms.
// The source question is already tagged, but dynamic notes and the completed
// answer audit must tag only the Korean substring without rewriting any text.
// This runs through the real 87-question unscored flow, never the official API.
test('Korean quoted in Chinese note stays tagged during S1 answer and audit', async ({ page }) => {
  test.setTimeout(90_000);
  // Playwright's two configured projects supply true 1440×900 and 440×956
  // viewport simulations; do not run both sizes again inside each project.
  const viewport = page.viewportSize();
  expect([[1440, 900], [440, 956]]).toContainEqual([viewport.width, viewport.height]);
    const outgoingWrites = [];
    page.on('request', request => {
      if (!['GET', 'HEAD'].includes(request.method())) outgoingWrites.push(request.url());
    });
    await page.goto('/the-community-lab/questionnaire/?season=1');

    let found = 0;
    for (let i = 0; i < 87; i++) {
      const group = await page.locator('#full-group').textContent();
      if (group?.includes('s1-openness-18')) {
        found++;
        const note = page.locator('#full-reader-note');
        await expect(note).toBeVisible();
        await expect(note).toContainText('原文“우리나라”在韩语中指韩国');
        await expect(note.locator('span[lang="ko"]')).toHaveText('우리나라');
        const rawText = await note.textContent();
        expect(rawText).toContain('因此中文写作“韩国”');
        await expect(page.locator('#full-ko')).toHaveAttribute('lang', 'ko');
      }
      await page.locator('#full-choices [role="radio"]').first().click();
      await page.locator('#full-next').click();
    }
    expect(found).toBe(1);
    await expect(page.locator('#full-done')).toBeVisible();
    await page.locator('#full-answer-audit summary').click();
    const auditRow = page.locator('#full-answer-audit .full-answer-audit-item')
      .filter({ hasText: 's1-openness-18' });
    await expect(auditRow).toHaveCount(1);
    await expect(auditRow.locator('.full-answer-audit-note')).toContainText(
      '原文“우리나라”在韩语中指韩国',
    );
    await expect(auditRow.locator('.full-answer-audit-note span[lang="ko"]'))
      .toHaveText('우리나라');
    expect(outgoingWrites).toEqual([]);
});
