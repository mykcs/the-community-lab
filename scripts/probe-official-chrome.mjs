/**
 * Manual Chrome-only read-only DOM reconnaissance, NOT a public overlay.
 * Usage: node scripts/probe-official-chrome.mjs --live-readonly
 *        node scripts/probe-official-chrome.mjs --live-path-readonly
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

export function overlayGate({ assetMatches, questionVisible, optionCount, expectedOptions, sourceIdCount, rawValueCount, textMatchCount, exactSourceOptionMapping }) {
  if (!assetMatches) return 'BLOCKED_SOURCE_ASSET_DRIFT';
  if (!questionVisible || optionCount !== expectedOptions) return 'BLOCKED_QUESTION_DOM_DRIFT';
  if (textMatchCount !== 1) return 'BLOCKED_MISSING_OR_AMBIGUOUS_SOURCE_TEXT';
  if (sourceIdCount !== 1 || rawValueCount !== optionCount) return 'BLOCKED_MISSING_DOM_IDENTITY';
  // Counts alone never prove original ID/value mapping. Even a duplicated
  // option value with correct attribute counts must fail closed.
  if (exactSourceOptionMapping !== true) return 'BLOCKED_UNVERIFIED_SOURCE_OPTION_MAPPING';
  return 'CANDIDATE_ONLY_REQUIRES_RIGHTS_AND_BILINGUAL_REVIEW';
}

/**
 * Diagnostic only: a short UI position prefix may precede the original Korean
 * statement. Never normalize or fuzzy-match the statement into a source ID.
 * Multiple matches are returned as ambiguous, not silently resolved.
 */
export function exactSuffixSourceMatches(liveText, entries) {
  if (typeof liveText !== 'string' || !Array.isArray(entries)) return [];
  // The public heading may prepend its observed literal "Q." label or a
  // numeric display position. Never fuzzy-match wording or treat arbitrary
  // short prefixes as identity evidence.
  const isPositionPrefix = prefix => prefix === '' || prefix === 'Q.' ||
    /^(?:0?[1-9]|[1-9][0-9]{1,2})(?:[.)][ ]?|[ ])$/.test(prefix);
  return entries.filter(q => {
    if (typeof q?.sourceKo !== 'string' || q.sourceKo.length === 0 ||
        !liveText.endsWith(q.sourceKo)) return false;
    return isPositionPrefix(liveText.slice(0, -q.sourceKo.length));
  }).map(q => ({ sourceId: q.id, prefixLength: liveText.length - q.sourceKo.length }));
}

/**
 * Pure fail-closed comparison of an observed question to the pinned pack.
 * No option value may be inferred from displayed order or Korean wording.
 * True means only source identity, NOT rights, translation or scoring parity.
 */
export function exactDomSourceOptionMapping({ headingText, sourceQuestionId, choices } = {}, entries) {
  const matches = exactSuffixSourceMatches(headingText, entries);
  if (matches.length !== 1 || !Array.isArray(choices)) return false;
  const source = entries.find(q => q.id === matches[0].sourceId);
  if (!source || sourceQuestionId !== source.id || !Array.isArray(source.options) ||
      choices.length !== source.options.length) return false;
  return choices.every((choice, index) =>
    choice && typeof choice.rawValue === 'string' &&
    choice.rawValue === String(source.options[index].value) &&
    typeof choice.koreanText === 'string' &&
    choice.koreanText === source.options[index].ko
  );
}

/**
 * Maps a visible question to a pinned source entry using exact Korean text only.
 * Labels (including intentional blank scale labels) must match in source order.
 * It proves text correspondence, not underlying button values or scoring.
 */
export function exactVisibleOptionLabelMapping({ headingText, optionLabels } = {}, entries) {
  const matches = exactSuffixSourceMatches(headingText, entries);
  if (matches.length !== 1 || !Array.isArray(optionLabels)) return null;
  const source = entries.find(q => q.id === matches[0].sourceId);
  if (!source || !Array.isArray(source.options) || optionLabels.length !== source.options.length) return null;
  if (!optionLabels.every((label, index) =>
    typeof label === 'string' && typeof source.options[index]?.ko === 'string' && label === source.options[index].ko
  )) return null;
  return { sourceId: source.id, optionCount: optionLabels.length };
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

    const { loadFullQuestionnaire } = await import('./load-full-questionnaire.mjs');
    const pack = loadFullQuestionnaire();
    if (pack.sourceSha256 !== sha) {
      console.log(JSON.stringify({ status: 'BLOCKED_LOCAL_SOURCE_PACK_DRIFT' }));
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
              sourceQuestionId: document.querySelector('[data-source-question-id]')?.getAttribute('data-source-question-id') ?? null,
              choices: choices.map(b => ({
                rawValue: b.getAttribute('data-source-option-value') ?? b.getAttribute('value'),
                koreanText: b.querySelector('[data-source-ko-option]')?.textContent ?? null,
              })),
              rawValueCount: choices.filter(b =>
                b.hasAttribute('value') || b.hasAttribute('data-source-option-value')
              ).length,
              overflowPx: Math.max(0, document.documentElement.scrollWidth - innerWidth),
            };
          });
          const exactSuffixMatches = exactSuffixSourceMatches(dom.headingText, pack.seasons[season]);
          const exactSourceOptionMapping = exactDomSourceOptionMapping(dom, pack.seasons[season]);
          findings.push({
            exactSuffixMatches,
            season, viewport: `${viewport.width}x${viewport.height}`, httpStatus: response?.status(),
            sourceAssetPinned: liveAsset === ASSET_PATH,
            questionSha256: createHash('sha256').update(dom.headingText).digest('hex'),
            optionCount: dom.optionCount, sourceIdCount: dom.sourceIdCount,
            rawValueCount: dom.rawValueCount, exactSourceOptionMapping, overflowPx: dom.overflowPx,
            blockedRequestsAfterStart: network.deniedAfterStart,
            attemptedNonGetRequests: network.attemptedWrites,
            overlayGate: overlayGate({ ...dom, expectedOptions, textMatchCount: exactSuffixMatches.length, assetMatches: liveAsset === ASSET_PATH, exactSourceOptionMapping }),
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

/** One complete visible question path per season; no last answer is selected. */
export async function probePathReadOnly() {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const check = await browser.newContext();
    const res = await check.request.get(ORIGIN + ASSET_PATH, { timeout: 20000 });
    const sha = res.ok() ? createHash('sha256').update(await res.body()).digest('hex') : null;
    await check.close();
    if (sha !== ASSET_SHA256) {
      console.log(JSON.stringify({ status: 'BLOCKED_SOURCE_ASSET_DRIFT', sourceStatus: res.status(), sourceSha256: sha }));
      process.exitCode = 2;
      return;
    }
    const { loadFullQuestionnaire } = await import('./load-full-questionnaire.mjs');
    const pack = loadFullQuestionnaire();
    if (pack.sourceSha256 !== sha) {
      console.log(JSON.stringify({ status: 'BLOCKED_LOCAL_SOURCE_PACK_DRIFT' }));
      process.exitCode = 2;
      return;
    }
    const findings = [];
    for (const { season } of CASES) {
      const expected = pack.seasons[season];
      const viewport = VIEWPORTS.find(size => size.width === 440 && size.height === 956);
      const context = await browser.newContext({ viewport, locale: 'ko-KR' });
      const network = { frozen: false, deniedAfterStart: 0, attemptedNonGetRequests: 0, resultRequestsObserved: 0 };
      await context.route('**/*', route => {
        const request = route.request();
        const method = request.method();
        if (!['GET', 'HEAD'].includes(method)) network.attemptedNonGetRequests++;
        if (new URL(request.url()).pathname === '/api/v1/results') network.resultRequestsObserved++;
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
      const questionIds = [];
      const mismatchCount = { question: 0, ambiguous: 0 };
      try {
        const response = await page.goto(`${ORIGIN}/season/${season}/test`, {
          waitUntil: 'domcontentloaded', timeout: 20000,
        });
        const liveAsset = await page.evaluate(() =>
          [...document.scripts].map(script => script.getAttribute('src')).find(src => src?.startsWith('/assets/index-')) ?? null
        );
        network.frozen = true;
        await page.locator('button').first().click({ timeout: 5000 });
        await page.locator('.question h1').first().waitFor({ timeout: 5000 });
        for (let index = 0; index < expected.length; index++) {
          const dom = await page.evaluate(() => {
            const heading = document.querySelector('.question h1');
            const buttons = [...document.querySelectorAll('.question button')].filter(button =>
              !button.classList.contains('back') && button.getClientRects().length > 0
            );
            return {
              headingText: heading?.textContent?.trim() ?? '',
              optionLabels: buttons.map(button => button.querySelector('span')?.textContent ?? ''),
            };
          });
          const mapping = exactVisibleOptionLabelMapping(dom, expected);
          const sourceMatches = exactSuffixSourceMatches(dom.headingText, expected);
          if (sourceMatches.length !== 1) mismatchCount.ambiguous++;
          if (!mapping) mismatchCount.question++;
          if (mapping) questionIds.push(mapping.sourceId);
          if (index === expected.length - 1) break;
          if (!mapping) break;
          await page.evaluate(() => {
            const firstAnswer = [...document.querySelectorAll('.question button')].find(button =>
              !button.classList.contains('back') && button.getClientRects().length > 0
            );
            if (!firstAnswer) throw new Error('visible answer button missing');
            firstAnswer.click();
          });
          await page.waitForFunction(previousHeading =>
            (document.querySelector('.question h1')?.textContent?.trim() ?? '') !== previousHeading,
          dom.headingText, { timeout: 5000 });
        }
        const expectedIds = expected.map(question => question.id);
        const observedIds = new Set(questionIds);
        const expectedIdSet = new Set(expectedIds);
        const completeUniqueQuestionSet = questionIds.length === expectedIds.length &&
          observedIds.size === expectedIdSet.size && [...expectedIdSet].every(id => observedIds.has(id));
        const orderSha256 = createHash('sha256').update(questionIds.join('\n')).digest('hex');
        const result = {
          season, viewport: `${viewport.width}x${viewport.height}`, httpStatus: response?.status(),
          sourceAssetPinned: liveAsset === ASSET_PATH,
          expectedQuestionCount: expected.length, observedQuestionCount: questionIds.length,
          allQuestionsMatchedExactly: completeUniqueQuestionSet && mismatchCount.question === 0,
          completeUniqueQuestionSet, orderedSourceIdsSha256: orderSha256,
          mismatchCount, stoppedOnUnansweredLastQuestion: completeUniqueQuestionSet,
          attemptedNonGetRequests: network.attemptedNonGetRequests,
          blockedRequestsAfterStart: network.deniedAfterStart,
          resultRequestsObserved: network.resultRequestsObserved,
        };
        findings.push(result);
        if (!result.allQuestionsMatchedExactly || !result.sourceAssetPinned ||
            network.attemptedNonGetRequests !== 0 || network.resultRequestsObserved !== 0) process.exitCode = 1;
      } catch (error) {
        findings.push({ season, viewport: `${viewport.width}x${viewport.height}`, status: 'OBSERVATION_FAILED', errorName: error.name, errorMessage: String(error.message).slice(0, 180) });
        process.exitCode = 1;
      } finally {
        await context.close();
      }
    }
    console.log(JSON.stringify({
      observedAt: new Date().toISOString(), sourceSha256: sha,
      method: 'headless Chrome; anonymous session; 440x956; exact Korean question and ordered option-label matching; post-start network frozen; last answer not selected',
      findings,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || !['--live-readonly', '--live-path-readonly'].includes(mode)) {
    console.error('Explicit --live-readonly or --live-path-readonly required; no automatic official-site requests.');
    process.exitCode = 2;
  } else if (mode === '--live-path-readonly') {
    probePathReadOnly().catch(error => { console.error(`${error.name}: ${String(error.message).slice(0, 180)}`); process.exitCode = 1; });
  } else {
    probe().catch(error => { console.error(error.name); process.exitCode = 1; });
  }
}
