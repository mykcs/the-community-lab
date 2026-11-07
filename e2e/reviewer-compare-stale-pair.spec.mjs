import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const reviewUrl = new URL('../docs/translation-review/index.html', import.meta.url).href;
const html = readFileSync(new URL('../docs/translation-review/index.html', import.meta.url), 'utf8');
const baseline = JSON.parse(html.split('<script id="embedded-data" type="application/json">')[1].split('</script>')[0]);

function file(name, content) {
  return {
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(content)),
  };
}

test('newest reviewer comparison wins over an older slow file pair', async ({ page }) => {
  await page.goto(reviewUrl);
  await page.evaluate(() => {
    const read = File.prototype.text;
    const pending = [];
    File.prototype.text = function () {
      if (!this.name.startsWith('slow-')) return read.call(this);
      return new Promise((resolve, reject) => {
        pending.push(() => read.call(this).then(resolve, reject));
      });
    };
    window.pendingSlowReviewReads = () => pending.length;
    window.releaseSlowReviewReads = () => {
      for (const release of pending.splice(0)) release();
    };
  });

  const modified = structuredClone(baseline);
  modified.questions[0].translation_zh_cn = '合成的第一版差异内容：仅用于比较竞争条件测试';
  const input = page.locator('#compare-files');

  // Pair A is older and will eventually report one differing Chinese text.
  await input.setInputFiles([
    file('slow-old-a.json', baseline),
    file('slow-old-b.json', modified),
  ]);
  await expect.poll(() => page.evaluate(() => window.pendingSlowReviewReads())).toBe(2);

  // Pair B is newer and identical. Its completed comparison must remain visible.
  await input.setInputFiles([
    file('new-a.json', baseline),
    file('new-b.json', baseline),
  ]);
  await expect(page.locator('#comparison')).toContainText('译文不一致：0');

  await page.evaluate(() => window.releaseSlowReviewReads());
  await expect.poll(() => page.evaluate(() => window.pendingSlowReviewReads())).toBe(0);
  // Let the resolved older microtasks run before asserting the final comparison.
  await page.waitForTimeout(100);
  await expect(page.locator('#comparison')).toContainText('译文不一致：0');
  await expect(page.locator('#comparison')).not.toContainText('译文不一致：1');
});
