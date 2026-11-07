import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// Local-only acceptance: no official-site requests, submitted results, or
// personal responses. Axe is injected only into this test context.
test.use({ bypassCSP: true });
const axePath = fileURLToPath(new URL('../node_modules/axe-core/axe.min.js', import.meta.url));

async function scan(page) {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const report = await globalThis.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    return report.violations.map(v => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map(n => n.target.join(' ')),
    }));
  });
}

for (const season of [1, 2]) {
  test(`season ${season}: completion view remains accessible after all local source-value answers`, async ({ page }) => {
    await page.goto('/the-community-lab/questionnaire/');
    await page.locator(`[data-start-season="${season}"]`).click();
    const count = season === 1 ? 87 : 37;
    for (let i = 0; i < count; i += 1) {
      await page.locator('#full-choices [role=radio]').first().click();
      await page.locator('#full-next').click();
    }
    await expect(page.locator('#full-done')).toBeVisible();
    await expect(page.getByRole('heading', { name: '你已经答完全部题目。' })).toBeVisible();
    expect(await scan(page)).toEqual([]);
    await page.locator('#full-answer-audit').evaluate(el => { el.open = true; });
    await expect(page.locator('.full-answer-audit-item').first()).toBeVisible();
    // All source answers are synthetic and remain in this isolated browser.
    expect(await scan(page)).toEqual([]);
  });
}

test('separate original-question translation review remains accessible', async ({ page }) => {
  await page.goto(new URL('../docs/original-question-translation-review/index.html', import.meta.url).href);
  expect(await scan(page)).toEqual([]);
});
