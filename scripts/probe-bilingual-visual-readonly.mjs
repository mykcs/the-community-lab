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
  } finally {
    for (const label of labels) label.remove();
  }
  return {
    ...result,
    cleanupComplete: document.querySelectorAll('[data-temporary-bilingual-visual-probe]').length === 0 &&
      heading.outerHTML === originalHeading &&
      buttons.every((button, index) => button.outerHTML === originalButtons[index]),
  };
}

async function observe() {
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
      mode: 'temporary-headless-Chrome-visual-only',
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
  if (!process.argv.includes('--live-readonly')) {
    console.error('Explicit --live-readonly required; no official requests sent');
    process.exitCode = 1;
  } else {
    observe().catch(() => {
      console.error('Research-only bilingual visual observation failed; no official result submitted');
      process.exitCode = 1;
    });
  }
}

[executed on device: miyuki-M2Max.local (7a113aa3-7af7-4565-a530-925856822986)]