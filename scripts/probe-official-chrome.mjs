/**
 * Manual Chrome-only read-only DOM reconnaissance, NOT a public overlay.
 * Usage: node scripts/probe-official-chrome.mjs --live-readonly
 * It never chooses an answer or submits a result, and it does not print
 * Korean questions, options, nickname, cookies, or answer vectors.
 */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const ORIGIN = 'https://thecommunity.co.kr';
const ASSET_PATH = '/assets/index-C735ffg4.js';
const ASSET_SHA256 = '59a67f9d1e0049156bedfe4d61a4cf8511dc8903ba80cf297b6bffad3c2b379e';
const CASES = [
  { season: 2, expectedOptions: 2 },
  { season: 1, expectedOptions: 4 },
];
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 440, height: 956 }];

export function overlayGate({ assetMatches, questionVisible, optionCount, expectedOptions, sourceIdCount, rawValueCount }) {
  if (!assetMatches) return 'BLOCKED_SOURCE_ASSET_DRIFT';
  if (!questionVisible || optionCount !== expectedOptions) return 'BLOCKED_QUESTION_DOM_DRIFT';
  if (sourceIdCount === 0 || rawValueCount !== optionCount) return 'BLOCKED_MISSING_DOM_IDENTITY';
  return 'CANDIDATE_ONLY_REQUIRES_EXACT_MAPPING_RIGHTS_AND_REVIEW';
}

export async function probe() {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const check = await browser.newContext();
    const res = await check.request.get(ORIGIN + ASSET_PATH, { timeout: 20000 });
    const sha = res.ok() ? createHash('sha256').update(await res.body()).digest('hex') : null;
    await check.close();
    const assetMatches = sha === ASSET_SHA256;
    if (!assetMatches) {
      console.log(JSON.stringify({ status: 'BLOCKED_SOURCE_ASSET_DRIFT', sourceStatus: res.status(), sourceSha256: sha }));
      process.exitCode = 2;
      return;
    }

    const findings = [];
    for (const { season, expectedOptions } of CASES) {
      for (const viewport of VIEWPORTS) {
        const context = await browser.newContext({ viewport, locale: 'ko-KR' });
        const network = { frozen: false, deniedAfterStart: 0, attemptedWrites: 0 };
        await context.route('**/*', route => {
          const request = route.request();
          const method = request.method();
          if (!['GET', 'HEAD'].includes(method)) network.attemptedWrites++;
          if (network.frozen) {
            network.deniedAfterStart++;
            return route.abort('blockedbyclient');
          }
          if (new URL(request.url()).origin !== ORIGIN || !['GET', 'HEAD'].includes(method)) {
            return route.abort('blockedbyclient');
          }
          return route.continue();
        });
        const page = await context.newPage();
        try {
          const response = await page.goto(`${ORIGIN}/season/${season}/test`, {
            waitUntil: 'domcontentloaded', timeout: 20000,
          });
          const liveAsset = await page.evaluate(() =>
            [...document.scripts].map(s => s.getAttribute('src')).find(s => s?.startsWith('/assets/index-')) ?? null
          );
          await page.locator(`#season-${season}-name`).fill('Synthetic Lab Visitor');
          // Lock all outgoing network before entering the locally-rendered first question.
          network.frozen = true;
          await page.locator('button').first().click({ timeout: 5000 });
          await page.locator('.question h1').first().waitFor({ timeout: 5000 });
          const dom = await page.evaluate(() => {
            const heading = document.querySelector('.question h1');
            const choices = [...document.querySelectorAll('button')].filter(b =>
              !b.classList.contains('back') && b.getClientRects().length > 0
            );
            return {
              headingText: heading?.textContent?.trim() ?? '',
              questionVisible: Boolean(heading),
              optionCount: choices.length,
              sourceIdCount: document.querySelectorAll('[data-source-question-id]').length,
              rawValueCount: choices.filter(b =>
                b.hasAttribute('value') || b.hasAttribute('data-source-option-value')
              ).length,
              overflowPx: Math.max(0, document.documentElement.scrollWidth - innerWidth),
            };
          });
          findings.push({
            season, viewport: `${viewport.width}x${viewport.height}`, httpStatus: response?.status(),
            sourceAssetPinned: liveAsset === ASSET_PATH,
            questionSha256: createHash('sha256').update(dom.headingText).digest('hex'),
            optionCount: dom.optionCount, sourceIdCount: dom.sourceIdCount,
            rawValueCount: dom.rawValueCount, overflowPx: dom.overflowPx,
            blockedRequestsAfterStart: network.deniedAfterStart,
            attemptedNonGetRequests: network.attemptedWrites,
            overlayGate: overlayGate({ ...dom, expectedOptions, assetMatches: liveAsset === ASSET_PATH }),
          });
        } catch (error) {
          findings.push({
            season, viewport: `${viewport.width}x${viewport.height}`,
            status: 'OBSERVATION_FAILED', errorName: error.name,
          });
          process.exitCode = 1;
        } finally {
          await context.close();
        }
      }
    }
    console.log(JSON.stringify({
      observedAt: new Date().toISOString(), sourceSha256: sha,
      method: 'headless Chrome; synthetic nickname; no answer selection; all post-start requests blocked',
      findings,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv.includes('--live-readonly')) {
    console.error('Explicit --live-readonly required; no automatic official-site requests.');
    process.exitCode = 2;
  } else {
    probe().catch(error => { console.error(error.name); process.exitCode = 1; });
  }
}
