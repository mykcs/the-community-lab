/**
 * Research-only proof of a Korean-first / Chinese-after VISUAL overlay on the
 * existing official DOM. Never ship as a userscript, extension or Pages asset.
 *
 * The official buttons do not expose stable raw answer-value attributes.
 * This deliberately does NOT infer them: it adds and immediately removes
 * inert sibling labels in a disposable browser, leaving all host controls
 * unmodified. It never submits a final answer or claims official scoring.
 */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadFullQuestionnaire } from './load-full-questionnaire.mjs';
import {
  assertPinnedLiveSourceAsset,
  exactVisibleOptionLabelMapping,
  safeReadOnlyProbeFailure,
  auditReadOnlyStoredRawChoice,
} from './probe-official-chrome.mjs';

const ORIGIN = 'https://thecommunity.co.kr';
const ASSET = '/assets/index-C735ffg4.js';
const SHA256 = '59a67f9d1e0049156bedfe4d61a4cf8511dc8903ba80cf297b6bffad3c2b379e';
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 440, height: 956 }];

/**
 * Exact visible Korean text and ordered label matches are ONLY a text-mapping
 * candidate. They do not prove DOM raw values, submitted payloads, translation
 * quality, legal publication scope or scoring parity.
 */
export function makeTemporaryBilingualCandidate(observed, entries) {
  const matched = exactVisibleOptionLabelMapping(observed, entries);
  if (!matched) return null;
  const question = entries.find(entry => entry.id === matched.sourceId);
  if (!question || typeof question.draftZh !== 'string' || !question.draftZh.trim() ||
      !Array.isArray(question.options) ||
      question.options.some(option => typeof option.zh !== 'string' || !option.zh.trim())) {
    return null;
  }
  return {
    exactHeading: observed.headingText,
    exactKoreanOptionLabels: [...observed.optionLabels],
    draftChineseQuestion: question.draftZh,
    draftChineseOptionLabels: question.options.map(option => option.zh),
  };
}

/**
 * Self-contained page.evaluate callback. Inserting sibling spans (never inside
 * the host's buttons) keeps the official button labels, values and handlers
 * untouched. Every inserted node is removed in finally, even on error.
 */
export function inspectTemporaryBilingualVisual(candidate) {
  const fail = reason => ({ passed: false, reason, labelsRendered: 0 });
  if (!candidate || !Array.isArray(candidate.exactKoreanOptionLabels) ||
      !Array.isArray(candidate.draftChineseOptionLabels) ||
      !candidate.draftChineseQuestion?.trim() ||
      candidate.exactKoreanOptionLabels.length !== candidate.draftChineseOptionLabels.length) {
    return fail('BLOCKED_INCOMPLETE_DRAFT');
  }
  // Only the separate pinned, non-final research caller may request a click.
  // No click occurs if the supplied identity or any visual gate fails.
  const clickRequested = Object.hasOwn(candidate, 'clickWhileRenderedIndex');
  if (clickRequested && (candidate.nonFinalSourcePositionVerified !== true ||
      !Number.isInteger(candidate.clickWhileRenderedIndex) ||
      candidate.clickWhileRenderedIndex < 0 ||
      candidate.clickWhileRenderedIndex >= candidate.exactKoreanOptionLabels.length)) {
    return fail('BLOCKED_UNSAFE_INTERACTION');
  }
  const heading = document.querySelector('.question h1');
  const buttons = [...document.querySelectorAll('.question button')]
    .filter(button => !button.classList.contains('back') && button.getClientRects().length > 0);
  if (!heading || heading.textContent.trim() !== candidate.exactHeading ||
      buttons.length !== candidate.exactKoreanOptionLabels.length ||
      !buttons.every((button, index) =>
        (button.querySelector('span')?.textContent ?? '') === candidate.exactKoreanOptionLabels[index])) {
    return fail('BLOCKED_DOM_DRIFT');
  }

  const originalHeading = heading.outerHTML;
  const originalButtons = buttons.map(button => button.outerHTML);
  const labels = [];
  let result = fail('BLOCKED_RENDER');
  let clickedWithLabels = false;
  try {
    const append = (source, chinese) => {
      const span = document.createElement('span');
      span.setAttribute('data-temporary-bilingual-visual-probe', '');
      span.setAttribute('data-nonofficial', 'research-only-ai-draft');
      span.setAttribute('lang', 'zh-CN');
      span.style.cssText = 'display:block;max-width:100%;box-sizing:border-box;white-space:normal;overflow-wrap:anywhere;line-height:1.65;font-size:.9em;pointer-events:none;';
      span.textContent = chinese;
      source.after(span);
      labels.push(span);
      return source.nextElementSibling === span;
    };
    const order = [append(heading, candidate.draftChineseQuestion)];
    buttons.forEach((button, index) =>
      order.push(append(button, candidate.draftChineseOptionLabels[index])));
    const originalControlsUnchanged =
      heading.outerHTML === originalHeading &&
      buttons.every((button, index) => button.outerHTML === originalButtons[index]);
    const overflowPx = Math.max(0, document.documentElement.scrollWidth - innerWidth);
    result = {
      passed: order.every(Boolean) && originalControlsUnchanged && overflowPx === 0,
      reason: 'TEMPORARY_VISUAL_ONLY_NOT_SCORE_EQUIVALENCE',
      labelsRendered: labels.length,
      koreanFirstChineseAfter: order.every(Boolean),
      originalControlsUnchanged,
      overflowPx,
    };
    if (clickRequested && result.passed) {
      // The official button's own handler sees the visible Chinese siblings.
      // Never rewrite its original label, input value or listener.
      clickedWithLabels = labels.every(label => label.isConnected) &&
        heading.outerHTML === originalHeading &&
        buttons.every((button, index) => button.outerHTML === originalButtons[index]);
      if (!clickedWithLabels) throw new Error('BLOCKED_LABELS_NOT_VISIBLE_AT_CLICK');
      buttons[candidate.clickWhileRenderedIndex].click();
    }
  } finally {
    for (const label of labels) label.remove();
  }
  return {
    ...result,
    clickTriggeredWithLabels: clickedWithLabels,
    // When a real host click re-renders its own controls, their markup is
    // expected to change. The research labels must still leave no residue.
    cleanupComplete: document.querySelectorAll('[data-temporary-bilingual-visual-probe]').length === 0 &&
      (clickRequested || (heading.outerHTML === originalHeading &&
        buttons.every((button, index) => button.outerHTML === originalButtons[index]))),
  };
}

async function readVisibleQuestion(page) {
  return page.evaluate(() => ({
    headingText: document.querySelector('.question h1')?.textContent?.trim() ?? '',
    optionLabels: [...document.querySelectorAll('.question button')]
      .filter(button => !button.classList.contains('back') && button.getClientRects().length > 0)
      .map(button => button.querySelector('span')?.textContent ?? ''),
  }));
}

/** The host's transient local answer map only; never log its raw contents. */
async function verifyAnonymousBrowserLocalValue(page, sourceId, rawValue) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidates = await page.evaluate(id => {
      const found = [];
      for (let i = 0; i < localStorage.length; i++) {
        try {
          const value = JSON.parse(localStorage.getItem(localStorage.key(i)));
          if (value && typeof value === 'object' && !Array.isArray(value) &&
              Object.hasOwn(value, id)) found.push(value[id]);
        } catch { /* Unrelated browser-local keys need not contain JSON. */ }
      }
      return found;
    }, sourceId);
    if (auditReadOnlyStoredRawChoice(candidates, rawValue)) return true;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  return false;
}

/** Bounded first→second→back→different-choice→second test, never last answer. */
async function observeLabelledClickBack(page, expected, network, season, viewport) {
  if (expected.length < 3) throw new Error('BLOCKED_UNSAFE_QUESTION_COUNT');
  const first = await readVisibleQuestion(page);
  const candidate = makeTemporaryBilingualCandidate(first, expected);
  if (!candidate || !first.headingText.endsWith(expected[0].sourceKo)) {
    throw new Error('BLOCKED_SOURCE_TEXT_IDENTITY');
  }
  const click = async choiceIndex => {
    const checked = await readVisibleQuestion(page);
    if (checked.headingText !== first.headingText ||
        JSON.stringify(checked.optionLabels) !== JSON.stringify(first.optionLabels)) {
      throw new Error('BLOCKED_RETURNED_QUESTION_DRIFT');
    }
    const result = await page.evaluate(inspectTemporaryBilingualVisual, {
      ...candidate, nonFinalSourcePositionVerified: true,
      clickWhileRenderedIndex: choiceIndex,
    });
    if (!result.passed || !result.clickTriggeredWithLabels || !result.cleanupComplete) {
      throw new Error('BLOCKED_LABELLED_CLICK_OR_CLEANUP');
    }
    await page.waitForFunction(previous =>
      (document.querySelector('.question h1')?.textContent?.trim() ?? '') !== previous,
    first.headingText, { timeout: 5000 });
    if (!await verifyAnonymousBrowserLocalValue(page, expected[0].id,
      expected[0].options[choiceIndex].value)) {
      throw new Error('BLOCKED_BROWSER_LOCAL_RAW_VALUE');
    }
    const next = await readVisibleQuestion(page);
    if (!makeTemporaryBilingualCandidate(next, [expected[1]]) ||
        !next.headingText.endsWith(expected[1].sourceKo)) {
      throw new Error('BLOCKED_NEXT_QUESTION_IDENTITY');
    }
    return { result, next };
  };

  const firstClick = await click(0);
  if (await page.locator('.question button.back:visible').count() !== 1) {
    throw new Error('BLOCKED_BACK_CONTROL_IDENTITY');
  }
  await page.locator('.question button.back:visible').click();
  await page.waitForFunction(previous =>
    (document.querySelector('.question h1')?.textContent?.trim() ?? '') !== previous,
  firstClick.next.headingText, { timeout: 5000 });
  const returned = await readVisibleQuestion(page);
  if (returned.headingText !== first.headingText ||
      JSON.stringify(returned.optionLabels) !== JSON.stringify(first.optionLabels)) {
    throw new Error('BLOCKED_BACK_RESTORE_DRIFT');
  }

  const changedClick = await click(first.optionLabels.length - 1);
  if (changedClick.next.headingText !== firstClick.next.headingText ||
      JSON.stringify(changedClick.next.optionLabels) !== JSON.stringify(firstClick.next.optionLabels) ||
      network.nonGetRequests || network.resultRequests) {
    throw new Error('BLOCKED_REENTER_OR_NETWORK');
  }
  return {
    season, viewport: viewport.width + 'x' + viewport.height,
    verifiedBilingualNonFinalClicks: 2,
    verifiedBackAndReentry: 1,
    verifiedBrowserLocalRawValues: 2,
    inertChineseLabelsRenderedAndRemoved:
      firstClick.result.labelsRendered + changedClick.result.labelsRendered,
    originalHostControlMarkupUnchangedAtClick: true,
    zeroResidualChineseLabels: true,
    nonGetRequests: network.nonGetRequests, resultRequests: network.resultRequests,
    finalAnswerSubmitted: false, status: 'RESEARCH_ONLY_NOT_OFFICIAL_EQUIVALENCE',
  };
}

async function observe({ interaction = false } = {}) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const assetContext = await browser.newContext();
    const assetResponse = await assetContext.request.get(ORIGIN + ASSET, { timeout: 20000 });
    const digest = assetResponse.ok()
      ? createHash('sha256').update(await assetResponse.body()).digest('hex') : null;
    await assetContext.close();
    const pack = loadFullQuestionnaire();
    if (digest !== SHA256 || pack.sourceSha256 !== SHA256) {
      throw new Error('BLOCKED_SOURCE_ASSET_DRIFT');
    }

    const observations = [];
    for (const season of [2, 1]) {
      for (const viewport of VIEWPORTS) {
        const context = await browser.newContext({ viewport, locale: 'ko-KR' });
        const network = { frozen: false, nonGetRequests: 0, resultRequests: 0 };
        await context.route('**/*', route => {
          const req = route.request();
          const url = new URL(req.url());
          if (req.method() !== 'GET' && req.method() !== 'HEAD') network.nonGetRequests++;
          if (url.pathname.startsWith('/api/v1/results')) network.resultRequests++;
          if (network.frozen || url.origin !== ORIGIN ||
              (req.method() !== 'GET' && req.method() !== 'HEAD')) {
            return route.abort('blockedbyclient');
          }
          return route.continue();
        });
        const page = await context.newPage();
        let renderedQuestions = 0;
        let renderedLabels = 0;
        try {
          const response = await page.goto(ORIGIN + '/season/' + season + '/test', {
            waitUntil: 'domcontentloaded', timeout: 20000,
          });
          if (response?.status() !== 200) throw new Error('BLOCKED_OFFICIAL_ENTRY');
          const liveAsset = await page.evaluate(() =>
            [...document.scripts].map(script => script.getAttribute('src'))
              .find(src => src?.startsWith('/assets/index-')) ?? null);
          assertPinnedLiveSourceAsset(liveAsset);
          network.frozen = true;
          await page.locator('button').first().click({ timeout: 5000 });
          await page.locator('.question h1').first().waitFor({ timeout: 5000 });
          const expected = pack.seasons[season];
          if (interaction) {
            observations.push(await observeLabelledClickBack(page, expected, network, season, viewport));
            continue;
          }
          for (let index = 0; index < expected.length; index++) {
            const observed = await page.evaluate(() => ({
              headingText: document.querySelector('.question h1')?.textContent?.trim() ?? '',
              optionLabels: [...document.querySelectorAll('.question button')]
                .filter(button => !button.classList.contains('back') && button.getClientRects().length > 0)
                .map(button => button.querySelector('span')?.textContent ?? ''),
            }));
            const candidate = makeTemporaryBilingualCandidate(observed, expected);
            if (!candidate || expected[index]?.sourceKo == null ||
                !observed.headingText.endsWith(expected[index].sourceKo)) {
              throw new Error('BLOCKED_SOURCE_TEXT_IDENTITY');
            }
            const result = await page.evaluate(inspectTemporaryBilingualVisual, candidate);
            if (!result.passed || !result.cleanupComplete) {
              throw new Error('BLOCKED_BILINGUAL_RENDER_OR_CLEANUP');
            }
            renderedQuestions++;
            renderedLabels += result.labelsRendered;
            if (index === expected.length - 1) break; // NEVER submit final answer.
            await page.evaluate(() => {
              const first = [...document.querySelectorAll('.question button')]
                .find(button => !button.classList.contains('back') && button.getClientRects().length > 0);
              if (!first) throw new Error('BLOCKED_NO_SOURCE_BUTTON');
              first.click();
            });
            await page.waitForFunction(previous =>
              (document.querySelector('.question h1')?.textContent?.trim() ?? '') !== previous,
            observed.headingText, { timeout: 5000 });
          }
          if (renderedQuestions !== expected.length || network.nonGetRequests ||
              network.resultRequests) throw new Error('BLOCKED_INCOMPLETE_OR_NETWORK');
          observations.push({
            season, viewport: viewport.width + 'x' + viewport.height,
            verifiedQuestionDisplays: renderedQuestions,
            inertChineseLabelsRenderedAndRemoved: renderedLabels,
            originalControlsUnchanged: true, nonGetRequests: network.nonGetRequests,
            resultRequests: network.resultRequests, finalAnswerSubmitted: false,
            status: 'RESEARCH_ONLY_NOT_OFFICIAL_EQUIVALENCE',
          });
        } catch (error) {
          observations.push({
            season, viewport: viewport.width + 'x' + viewport.height,
            verifiedQuestionDisplays: renderedQuestions, ...safeReadOnlyProbeFailure(error),
          });
          process.exitCode = 1;
        } finally {
          await context.close();
        }
      }
    }
    console.log(JSON.stringify({
      mode: interaction ? 'pinned-client-temporary-label-click-back-reentry' :
        'temporary-headless-Chrome-visual-only',
      pinnedSourceSha256: SHA256,
      translationStatus: 'AI_DRAFT_UNREVIEWED',
      publishedOfficialSiteUserscript: false,
      officialScoreParityVerified: false,
      observations,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const interaction = process.argv.includes('--live-interaction-readonly');
  if (!process.argv.includes('--live-readonly') && !interaction) {
    console.error('Explicit --live-readonly or --live-interaction-readonly required; no official requests sent');
    process.exitCode = 1;
  } else {
    observe({ interaction }).catch(() => {
      console.error('Research-only bilingual visual observation failed; no official result submitted');
      process.exitCode = 1;
    });
  }
}
