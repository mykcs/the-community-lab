/**
 * Manual Chrome-only read-only DOM reconnaissance, NOT a public overlay.
 * Usage: node scripts/probe-official-chrome.mjs --live-readonly
 *        node scripts/probe-official-chrome.mjs --live-path-readonly
 *        node scripts/probe-official-chrome.mjs --live-path-all-options-readonly
 *        node scripts/probe-official-chrome.mjs --live-path-local-values-readonly
 * Path modes use synthetic choices in anonymous sessions but never submit a
 * result. No mode prints Korean prompts/options, nickname, cookies, or vectors.
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

// The official site and browser automation may produce error messages with
// page text, URLs, or local request context. Probe output may be copied into
// public issue/CI evidence, so never forward error.message, stack or an
// arbitrary error.name. Only these structural diagnostics are allowed.
export function safeReadOnlyProbeFailure(error) {
  const allowed = new Set(['TimeoutError', 'TargetClosedError', 'Error', 'TypeError', 'ReferenceError']);
  return {
    status: 'OBSERVATION_FAILED',
    errorKind: allowed.has(error?.name) ? error.name : 'UNKNOWN_ERROR',
  };
}

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
            ...safeReadOnlyProbeFailure(error),
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

/**
 * A complete but reordered set is NOT a passing pinned-client path audit.
 * These identities are already sourced from the local fixed client pack.
 */
export function auditReadOnlyQuestionOrder(observedIds, expectedIds) {
  if (!Array.isArray(observedIds) || !Array.isArray(expectedIds) ||
      expectedIds.length === 0) throw new Error('invalid read-only path identity');
  const observed = new Set(observedIds);
  const expected = new Set(expectedIds);
  const completeUniqueQuestionSet = observedIds.length === expectedIds.length &&
    observed.size === expected.size && expected.size === expectedIds.length &&
    [...expected].every(id => observed.has(id));
  return {
    completeUniqueQuestionSet,
    orderedPathMatchesPinnedClient: completeUniqueQuestionSet &&
      expectedIds.every((id, index) => observedIds[index] === id),
  };
}

/** Cover every transition that can lead to another question without reaching submit. */
export function readOnlyBacktrackPositions(questionCount) {
  if (!Number.isInteger(questionCount) || questionCount < 3) {
    throw new Error('invalid read-only backtrack question count');
  }
  return Array.from({ length: questionCount - 1 }, (_, index) => index);
}

/** Guard one local-only back-and-rechoose transition. No score claim. */
export function auditReadOnlyBacktrack({
  questionIndex, currentId, revisitedCurrentId, nextId, revisitedNextId,
} = {}, expectedIds) {
  if (!Array.isArray(expectedIds) || !Number.isInteger(questionIndex) ||
      questionIndex < 0 || questionIndex >= expectedIds.length - 1) return false;
  const expectedCurrent = expectedIds[questionIndex];
  const expectedNext = expectedIds[questionIndex + 1];
  return typeof expectedCurrent === 'string' && typeof expectedNext === 'string' &&
    expectedCurrent !== expectedNext && currentId === expectedCurrent &&
    revisitedCurrentId === expectedCurrent && nextId === expectedNext &&
    revisitedNextId === expectedNext;
}

export function readOnlyPathChoiceIndex(optionCount, strategy = 'first') {
  if (!Number.isInteger(optionCount) || optionCount < 1 ||
      !['first', 'last'].includes(strategy)) {
    throw new Error('invalid read-only option strategy');
  }
  return strategy === 'last' ? optionCount - 1 : 0;
}

export function readOnlyPathChoiceIndices(optionCount, strategy = 'first') {
  if (!Number.isInteger(optionCount) || optionCount < 1 ||
      !['first', 'last', 'all'].includes(strategy)) {
    throw new Error('invalid read-only option strategy');
  }
  if (strategy === 'all') return Array.from({ length: optionCount }, (_, index) => index);
  return [readOnlyPathChoiceIndex(optionCount, strategy)];
}

export function auditReadOnlyOptionCoverage(observedIndices, expectedOptionCount) {
  return Number.isInteger(expectedOptionCount) && expectedOptionCount > 0 &&
    Array.isArray(observedIndices) && observedIndices.length === expectedOptionCount &&
    observedIndices.every((index, position) => index === position);
}

/**
 * Verify one exact browser-local source-value binding in a synthetic session.
 * Never print, return from the CLI, or persist the observed local answer map.
 */
export function auditReadOnlyStoredRawChoice(candidates, expectedValue) {
  return Array.isArray(candidates) && candidates.length === 1 &&
    (typeof expectedValue === 'string' || Number.isFinite(expectedValue)) &&
    candidates[0] === expectedValue;
}

/** Full pinned-client visible path, never selecting a final answer or submitting. */
export async function probePathReadOnly({
  choiceStrategy = 'first', backtrack = false, allOptions = false,
  verifyStoredRawValues = false,
} = {}) {
  if (verifyStoredRawValues && !allOptions) {
    throw new Error('RAW_VALUE_PROBE_REQUIRES_ALL_OPTIONS');
  }
  readOnlyPathChoiceIndices(1, allOptions ? 'all' : choiceStrategy);
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
      const backtrackPositions = backtrack ? readOnlyBacktrackPositions(expected.length) : [];
      const backtrackChecks = [];
      const optionCoverageChecks = [];
      let storedRawValueChecks = 0;
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
        const readVisibleQuestion = () => page.evaluate(() => ({
          headingText: document.querySelector('.question h1')?.textContent?.trim() ?? '',
          optionLabels: [...document.querySelectorAll('.question button')]
            .filter(button => !button.classList.contains('back') && button.getClientRects().length > 0)
            .map(button => button.querySelector('span')?.textContent ?? ''),
        }));
        for (let index = 0; index < expected.length; index++) {
          const dom = await readVisibleQuestion();
          const mapping = exactVisibleOptionLabelMapping(dom, expected);
          const sourceMatches = exactSuffixSourceMatches(dom.headingText, expected);
          if (sourceMatches.length !== 1) mismatchCount.ambiguous++;
          if (!mapping) mismatchCount.question++;
          if (mapping) questionIds.push(mapping.sourceId);
          if (index === expected.length - 1) break;
          if (!mapping) break;
          const choiceIndices = readOnlyPathChoiceIndices(dom.optionLabels.length,
            allOptions ? 'all' : choiceStrategy);
          const observedOptionIndices = [];
          for (const [choicePass, choiceIndex] of choiceIndices.entries()) {
            await page.evaluate(buttonIndex => {
              const answerButtons = [...document.querySelectorAll('.question button')].filter(button =>
                !button.classList.contains('back') && button.getClientRects().length > 0
              );
              const answer = answerButtons[buttonIndex];
              if (!answer) throw new Error('visible answer button missing');
              answer.click();
            }, choiceIndex);
            await page.waitForFunction(previousHeading =>
              (document.querySelector('.question h1')?.textContent?.trim() ?? '') !== previousHeading,
            dom.headingText, { timeout: 5000 });
            if (verifyStoredRawValues) {
              const expectedRaw = expected[index]?.options[choiceIndex]?.value;
              // The real DOM does not expose source IDs or raw button values.
              // Read only the chosen source ID's value from the synthetic
              // browser's local answer state; never print/store the answer map.
              const observed = await page.evaluate(async ({ sourceId, rawValue }) => {
                const readCandidates = () => {
                  const matches = [];
                  for (let i = 0; i < localStorage.length; i++) {
                    try {
                      const value = JSON.parse(localStorage.getItem(localStorage.key(i)));
                      if (value && typeof value === 'object' && !Array.isArray(value) &&
                          Object.hasOwn(value, sourceId)) matches.push(value[sourceId]);
                    } catch { /* An unrelated key need not contain JSON. */ }
                  }
                  return matches;
                };
                for (let attempt = 0; attempt < 8; attempt++) {
                  const values = readCandidates();
                  if (values.length === 1 && values[0] === rawValue) return values;
                  await new Promise(resolve => setTimeout(resolve, 40));
                }
                return readCandidates();
              }, { sourceId: mapping.sourceId, rawValue: expectedRaw });
              if (!auditReadOnlyStoredRawChoice(observed, expectedRaw)) {
                throw new Error('LOCAL_SOURCE_RAW_VALUE_BINDING_MISMATCH');
              }
              storedRawValueChecks++;
            }
            const nextBefore = await readVisibleQuestion();
            const nextMapping = exactVisibleOptionLabelMapping(nextBefore, expected);
            const nextIdentityCorrect = nextMapping?.sourceId === expected[index + 1]?.id &&
              await page.locator('.question button.back:visible').count() === 1;
            if (!nextIdentityCorrect) throw new Error('NEXT_QUESTION_SOURCE_DRIFT');
            observedOptionIndices.push(choiceIndex);

            if (allOptions && choicePass < choiceIndices.length - 1) {
              await page.locator('.question button.back:visible').click();
              await page.waitForFunction(heading =>
                document.querySelector('.question h1')?.textContent?.trim() === heading,
              dom.headingText, { timeout: 5000 });
              const revisitedCurrent = await readVisibleQuestion();
              const revisitedMapping = exactVisibleOptionLabelMapping(revisitedCurrent, expected);
              if (revisitedMapping?.sourceId !== mapping.sourceId ||
                  JSON.stringify(revisitedCurrent.optionLabels) !== JSON.stringify(dom.optionLabels)) {
                throw new Error('ALL_OPTIONS_CURRENT_QUESTION_DRIFT');
              }
            } else if (!allOptions && backtrackPositions.includes(index)) {
              // Exercise every return/edit transition without completing a
              // survey. Fail closed on pinned source identities.
              await page.locator('.question button.back:visible').click();
              await page.waitForFunction(heading =>
                document.querySelector('.question h1')?.textContent?.trim() === heading,
              dom.headingText, { timeout: 5000 });
              const revisitedCurrent = await readVisibleQuestion();
              const restored = exactVisibleOptionLabelMapping(revisitedCurrent, expected);
              if (restored?.sourceId !== mapping.sourceId || revisitedCurrent.optionLabels.length < 2) {
                throw new Error('BACKTRACK_CURRENT_QUESTION_DRIFT');
              }
              // Select a different visible button; never infer any server raw
              // values from its displayed index. Outgoing requests stay blocked.
              const oppositeIndex = choiceIndex === 0 ? revisitedCurrent.optionLabels.length - 1 : 0;
              await page.evaluate(buttonIndex => {
                const choices = [...document.querySelectorAll('.question button')]
                  .filter(button => !button.classList.contains('back') && button.getClientRects().length > 0);
                if (!choices[buttonIndex]) throw new Error('BACKTRACK_ALTERNATE_MISSING');
                choices[buttonIndex].click();
              }, oppositeIndex);
              await page.waitForFunction(heading =>
                (document.querySelector('.question h1')?.textContent?.trim() ?? '') !== heading,
              revisitedCurrent.headingText, { timeout: 5000 });
              const revisitedNext = await readVisibleQuestion();
              const reentered = exactVisibleOptionLabelMapping(revisitedNext, expected);
              const validated = auditReadOnlyBacktrack({
                questionIndex: index, currentId: mapping.sourceId,
                revisitedCurrentId: restored.sourceId,
                nextId: nextMapping?.sourceId, revisitedNextId: reentered?.sourceId,
              }, expected.map(q => q.id));
              backtrackChecks.push({ questionIndex: index, validated });
              if (!validated) throw new Error('BACKTRACK_NEXT_QUESTION_DRIFT');
            }
          }
          const optionCoverageValidated = auditReadOnlyOptionCoverage(
            observedOptionIndices, dom.optionLabels.length,
          );
          if (allOptions) {
            optionCoverageChecks.push({
              questionIndex: index, expectedOptionCount: dom.optionLabels.length,
              observedOptionIndices, allOptionsNavigateToExpectedNext: optionCoverageValidated,
            });
            if (!optionCoverageValidated) throw new Error('ALL_OPTIONS_COVERAGE_INCOMPLETE');
          }
        }
        const expectedIds = expected.map(question => question.id);
        const backtrackValidated = !backtrack ||
          backtrackChecks.length === backtrackPositions.length &&
          backtrackChecks.every(check => check.validated);
        const expectedNonFinalOptionCount = expected.slice(0, -1)
          .reduce((count, question) => count + question.options.length, 0);
        const storedRawValuesValidated = verifyStoredRawValues
          ? storedRawValueChecks === expectedNonFinalOptionCount : null;
        const allOptionsValidated = allOptions
          ? optionCoverageChecks.length === expected.length - 1 &&
            optionCoverageChecks.every(check => check.allOptionsNavigateToExpectedNext &&
              check.expectedOptionCount === expected[check.questionIndex]?.options.length)
          : null;
        const { completeUniqueQuestionSet, orderedPathMatchesPinnedClient } =
          auditReadOnlyQuestionOrder(questionIds, expectedIds);
        const orderSha256 = createHash('sha256').update(questionIds.join('\n')).digest('hex');
        const result = {
          season, viewport: `${viewport.width}x${viewport.height}`, httpStatus: response?.status(),
          sourceAssetPinned: liveAsset === ASSET_PATH,
          expectedQuestionCount: expected.length, observedQuestionCount: questionIds.length,
          allQuestionsMatchedExactly: orderedPathMatchesPinnedClient &&
            mismatchCount.question === 0 && mismatchCount.ambiguous === 0 &&
            (!backtrack || backtrackValidated) && (!allOptions || allOptionsValidated) &&
            (!verifyStoredRawValues || storedRawValuesValidated),
          completeUniqueQuestionSet, orderedPathMatchesPinnedClient,
          choiceStrategy: allOptions ? 'all' : choiceStrategy,
          backtrackAttempted: backtrack,
          backtrackPositions, backtrackChecks, backtrackValidated,
          allOptionsAttempted: allOptions, optionCoverageChecks, allOptionsValidated,
          localRawValueAuditAttempted: verifyStoredRawValues,
          nonFinalRawValuesVerified: storedRawValueChecks,
          expectedNonFinalRawValues: expectedNonFinalOptionCount,
          localRawValuesValidated: storedRawValuesValidated,
          // Last-question buttons are deliberately never selected.
          lastQuestionRawValuesVerified: 0,
          orderedSourceIdsSha256: orderSha256,
          mismatchCount, stoppedOnUnansweredLastQuestion: completeUniqueQuestionSet,
          attemptedNonGetRequests: network.attemptedNonGetRequests,
          blockedRequestsAfterStart: network.deniedAfterStart,
          resultRequestsObserved: network.resultRequestsObserved,
        };
        findings.push(result);
        if (!result.allQuestionsMatchedExactly || !result.sourceAssetPinned ||
            network.attemptedNonGetRequests !== 0 || network.resultRequestsObserved !== 0) process.exitCode = 1;
      } catch (error) {
        findings.push({ season, viewport: `${viewport.width}x${viewport.height}`, ...safeReadOnlyProbeFailure(error) });
        process.exitCode = 1;
      } finally {
        await context.close();
      }
    }
    console.log(JSON.stringify({
      observedAt: new Date().toISOString(), sourceSha256: sha,
      method: verifyStoredRawValues
        ? 'headless Chrome; anonymous session; 440x956; every non-final visible option compared with the exact source ID/raw value saved in synthetic browser localStorage; no answers logged, post-start network frozen, last answer not selected; NOT proof of server receipt or scoring'
        : allOptions
          ? 'headless Chrome; anonymous session; 440x956; exact Korean question, option labels and pinned path order; each visible option is selected and advanced to the exact next question; returns to the current question between choices; post-start network frozen; last answer not selected'
          : 'headless Chrome; anonymous session; 440x956; exact Korean question, option labels and pinned path order; post-start network frozen; every non-final answer may be changed after backtracking; last answer not selected',
      choiceStrategy: allOptions ? 'all' : choiceStrategy,
      backtrackAttempted: backtrack, allOptionsAttempted: allOptions,
      localRawValueAuditAttempted: verifyStoredRawValues,
      backtrackPositionsBySeason: backtrack
        ? Object.fromEntries(Object.entries(pack.seasons).map(([season, questions]) => [
          season, readOnlyBacktrackPositions(questions.length),
        ]))
        : {},
      findings,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || !['--live-readonly', '--live-path-readonly',
    '--live-path-last-option-readonly', '--live-path-backtrack-readonly',
    '--live-path-all-options-readonly', '--live-path-local-values-readonly'].includes(mode)) {
    console.error('Explicit read-only probe mode required; no automatic official-site requests.');
    process.exitCode = 2;
  } else if (mode === '--live-path-readonly' || mode === '--live-path-last-option-readonly' ||
    mode === '--live-path-backtrack-readonly' || mode === '--live-path-all-options-readonly' ||
    mode === '--live-path-local-values-readonly') {
    const choiceStrategy = mode === '--live-path-last-option-readonly' ? 'last' : 'first';
    probePathReadOnly({ choiceStrategy,
      backtrack: mode === '--live-path-backtrack-readonly',
      allOptions: mode === '--live-path-all-options-readonly' ||
        mode === '--live-path-local-values-readonly',
      verifyStoredRawValues: mode === '--live-path-local-values-readonly',
    })
      .catch(error => { console.error(safeReadOnlyProbeFailure(error).errorKind); process.exitCode = 1; });
  } else {
    probe().catch(error => { console.error(safeReadOnlyProbeFailure(error).errorKind); process.exitCode = 1; });
  }
}
