import { expect, test } from '@playwright/test';

test('private quiz blocks synthetic embedded frames, media, and same-origin tracking pixels', async ({ page }) => {
  // The fake collector is intercepted in-browser; no actual collector is contacted.
  // These are resource types NOT covered by connect-src or external img-src alone.
  const dispatched = [];
  await page.route(/example\.invalid|__synthetic_private_pixel__/, async route => {
    dispatched.push({ url: route.request().url(), type: route.request().resourceType() });
    await route.fulfill({ status: 204 });
  });

  await page.goto('/the-community-lab/questionnaire/?season=2');
  await page.locator('.full-choice').first().click();
  await page.evaluate(async () => {
    const frame = document.createElement('iframe');
    frame.src = 'https://example.invalid/frame?choice=SYNTHETIC';
    document.body.append(frame);

    const audio = document.createElement('audio');
    audio.preload = 'auto';
    audio.src = 'https://example.invalid/audio?choice=SYNTHETIC';
    document.body.append(audio);
    audio.load();

    const pixel = new Image();
    pixel.src = new URL('__synthetic_private_pixel__?choice=SYNTHETIC', location.href).href;
    document.body.append(pixel);
    await new Promise(resolve => setTimeout(resolve, 450));
  });

  expect(dispatched, 'private-choice transport must be blocked before network dispatch').toEqual([]);
  await expect(page.locator('#full-count')).toContainText('已答 1 / 37');
  await expect(page.locator('#full-next')).toBeEnabled();
});
