import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const reviewUrl = new URL("../docs/translation-review/index.html", import.meta.url).href;
const html = readFileSync(new URL("../docs/translation-review/index.html", import.meta.url), "utf8");
const embedded = html.split('<script id="embedded-data" type="application/json">')[1]?.split("</script>")[0];
if (!embedded) throw new Error("译审基线数据丢失");

// A successful offline import persists its data: an earlier quota failure
// must not leave a spurious unsaved-edits navigation warning behind.
test("successful import clears a stale quota-failure navigation warning", async ({ page }) => {
  await page.goto(reviewUrl);
  const imported = JSON.parse(embedded);
  imported.questions[0].translation_zh_cn = "本地合成恢复译文，不是人工正式审校";
  const file = {
    name: "synthetic-review-recovery.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  };
  page.on("dialog", async dialog => { await dialog.accept(); });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.restoreStorageAfterQuota = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith("community-lab-question-review-v1:")) {
        throw new DOMException("synthetic quota error", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  });
  await page.locator("#list .card").first().getByLabel(/中文翻译/).fill("未保存的本地合成文本");
  await expect(page.locator(".statusline")).toContainText("未保存到此设备");
  await page.evaluate(() => window.restoreStorageAfterQuota());
  await page.locator("#import-file").setInputFiles(file);
  await expect(page.locator(".statusline")).toContainText("已从同一来源版本恢复");
  await expect(page.locator("#list .card").first().getByLabel(/中文翻译/)).toHaveValue(imported.questions[0].translation_zh_cn);
  const warningStillAttached = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(warningStillAttached).toBe(false);
});
