import { expect, test } from '@playwright/test';
import { GUEST_SOCIAL_DIRECTORY } from '../data/guest-social-directory.mjs';

// WCAG 3.1.2 applies to generated views too, not only the Astro HTML.
// Check every visible Hangul text node against its nearest declared language;
// this prevents another inaccessible Korean label from escaping review because
// it is rendered only after the last original-demo question.
async function untaggedVisibleKorean(page) {
  return page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const misses = [];
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim();
      if (!/[가-힣ㄱ-ㅎㅏ-ㅣ]/u.test(text)) continue;
      const parent = walker.currentNode.parentElement;
      if (!parent || parent.closest('script,style,template,[hidden]')) continue;
      if (parent.closest('[lang]')?.getAttribute('lang')?.toLowerCase() === 'ko') continue;
      misses.push({ text: text.slice(0, 100), tag: parent.tagName.toLowerCase() });
    }
    return misses;
  });
}

test('homepage marks every visible Korean text node and keeps source-link names', async ({ page }) => {
  await page.goto('/the-community-lab/');
  expect(await untaggedVisibleKorean(page)).toEqual([]);
  const people = page.locator('#guest-social .guest-social-person');
  await expect(people).toHaveCount(GUEST_SOCIAL_DIRECTORY.length);
  for (const person of await people.all()) {
    const name = person.locator('strong[lang=ko]');
    await expect(name).toHaveCount(1);
    const links = person.locator('.guest-social-links a');
    for (const link of await links.all()) {
      const refs = (await link.getAttribute('aria-labelledby'))?.split(/\s+/) ?? [];
      expect(refs.length).toBeGreaterThanOrEqual(2);
      expect(refs[0]).toBe(await name.getAttribute('id'));
      for (const id of refs) {
        expect(await page.locator(`[id="${id}"]`).count()).toBe(1);
      }
      await expect(link).not.toHaveAttribute('aria-label', /[가-힣]/u);
    }
  }
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 440, height: 956 },
]) {
  test(`both original-demo results keep Korean guest names readable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const [season, count] of [[1, 8], [2, 6]]) {
      await page.goto('/the-community-lab/');
      await page.locator(`#start-s${season}`).click();
      await expect(page.locator('#quiz-heading [lang=ko]')).toHaveText('한국어 · 자체 제작 예시');
      expect(await untaggedVisibleKorean(page)).toEqual([]);
      for (let i = 0; i < count; i++) {
        await page.locator('.answer-option').first().click();
        await page.locator('#quiz-next').click();
      }
      await expect(page.locator('#result-view')).toBeVisible();
      const directory = page.locator('#result-content .guest-social-person');
      const expectedGuests = GUEST_SOCIAL_DIRECTORY.filter(guest => guest.season === season);
      await expect(directory).toHaveCount(expectedGuests.length);
      for (const [index, guest] of expectedGuests.entries()) {
        const person = directory.nth(index);
        const koreanName = person.locator('strong span[lang=ko]');
        await expect(koreanName).toHaveText(guest.stage_name_ko);
        const nameId = await koreanName.getAttribute('id');
        const links = person.locator('.guest-social-links a');
        await expect(links).toHaveCount(guest.accounts.length * 2);
        for (const link of await links.all()) {
          const refs = (await link.getAttribute('aria-labelledby'))?.split(/\s+/) ?? [];
          expect(refs[0]).toBe(nameId);
          for (const id of refs) {
            expect(await page.locator(`[id="${id}"]`).count()).toBe(1);
          }
        }
      }
      expect(await untaggedVisibleKorean(page)).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });
}
