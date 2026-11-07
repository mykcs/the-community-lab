import { expect, test } from '@playwright/test';

// Public feedback must be an explicit new-tab choice with NO private answer
// data or Korean source prose. Browser tests run on desktop and 440x956.
for (const [season, expectedFirstId] of [[2, 'ms10'], [1, 's1-class-15']]) {
  test(`season ${season}: feedback uses source identity only and follows navigation`, async ({ page }) => {
    await page.goto(`/the-community-lab/questionnaire/?season=${season}`);
    const link = page.locator('#full-report-translation');
    await expect(link).toBeAttached();
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    const href = await link.getAttribute('href');
    const first = new URL(href);
    expect(first.origin).toBe('https://github.com');
    expect(first.pathname).toBe('/mykcs/the-community-lab/issues/new');
    expect(first.searchParams.get('title')).toContain(expectedFirstId);
    const body = first.searchParams.get('body');
    expect(body).toContain(`源题索引：${expectedFirstId}`);
    expect(body).toContain('请勿填写自己的答案');
    expect(body).not.toContain('selectedValue');
    expect(body).not.toContain('translationFingerprint');
    // Merely selecting an answer must not modify the external link.
    await page.locator('#full-choices button').first().click();
    await expect(link).toHaveAttribute('href', href);
    // Navigation must bind feedback to the NEW question without exporting
    // the previous selection or even its Korean / Chinese wording.
    await page.locator('#full-next').click();
    const next = new URL(await link.getAttribute('href'));
    expect(next.searchParams.get('title')).not.toContain(expectedFirstId);
    expect(next.searchParams.get('body')).not.toContain(expectedFirstId);
    expect(next.searchParams.get('body')).toMatch(/源题索引：/);
    expect(next.searchParams.get('body')).not.toContain('selectedValue');
    expect(next.searchParams.get('body')).not.toContain('translationFingerprint');
  });
}
