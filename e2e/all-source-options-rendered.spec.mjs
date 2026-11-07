import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';

// Browser-level bridge between the independently recorded client source-ID/
// option-value index and the unreviewed static quiz's actual rendered DOM.
// No external source text is copied into this test, no official responses are
// submitted, and it never claims server-side scoring or translation approval.
const pack = loadFullQuestionnaire();
const sourceIndex = JSON.parse(readFileSync(
  new URL('../data/original-question-index.json', import.meta.url), 'utf8',
));

for (const season of [2, 1]) {
  test(`S${season}: all source values and bilingual options survive every rendered question`, async ({ page }) => {
    test.setTimeout(120_000);
    const questions = pack.seasons[season];
    const sourceQuestions = sourceIndex.questions
      .filter(item => item.season === season)
      .sort((a, b) => a.displayPositionDerivedFromClient - b.displayPositionDerivedFromClient);
    expect(questions).toHaveLength(season === 2 ? 37 : 87);
    expect(sourceQuestions).toHaveLength(questions.length);

    const requests = [];
    page.on('request', request => {
      if (request.method() !== 'GET' || !request.url().startsWith('http://127.0.0.1:')) {
        requests.push({ method: request.method(), url: new URL(request.url()).origin });
      }
    });
    await page.goto(`/the-community-lab/questionnaire/?season=${season}`);
    let checkedOptions = 0;
    for (const [position, q] of questions.entries()) {
      const source = sourceQuestions[position];
      expect(q.id).toBe(source.sourceQuestionId);
      expect(q.order).toBe(source.displayPositionDerivedFromClient);
      expect(q.options.map(o => o.value)).toEqual(source.optionValues);

      // Return only *which contract failed*, never publish copyrighted wording
      // or the synthetic choice vector to test output.
      const violations = await page.evaluate(({ q, source }) => {
        const bad = [];
        const el = id => document.getElementById(id);
        const Korean = el('full-ko');
        const Chinese = el('full-zh');
        const choices = [...el('full-choices').children];
        if (el('full-position').textContent !==
            `第 ${String(q.order).padStart(2, '0')} / ${source.season === 2 ? 37 : 87} 题`) bad.push('position');
        if (!el('full-group').textContent.includes(q.id)) bad.push('source-id');
        if (document.documentElement.scrollWidth > window.innerWidth) bad.push('horizontal-overflow');
        if (Korean.textContent !== q.sourceKo || Korean.lang !== 'ko') bad.push('korean-question');
        if (Chinese.textContent !== q.draftZh) bad.push('chinese-draft');
        if (!(Korean.compareDocumentPosition(Chinese) & Node.DOCUMENT_POSITION_FOLLOWING)) bad.push('korean-first');
        if (el('full-choices').getAttribute('role') !== 'radiogroup' ||
            el('full-choices').getAttribute('aria-labelledby') !== 'full-ko full-zh full-choice-prompt') {
          bad.push('radio-group-context');
        }
        if (choices.length !== source.optionCount) bad.push('option-count');
        if (q.season === 2 && (el('full-group').querySelector('[lang="ko"]')?.textContent !== q.groupKo ||
            el('full-group').textContent.indexOf(q.groupKo) >= el('full-group').textContent.indexOf(q.group))) {
          bad.push('s2-group-korean-first');
        }
        for (const [i, option] of q.options.entries()) {
          const button = choices[i];
          if (!button || button.getAttribute('role') !== 'radio' ||
              button.getAttribute('aria-checked') !== 'false' ||
              button.hasAttribute('aria-label')) { bad.push(`radio-${i}`); continue; }
          const mark = button.querySelector('.full-choice-mark');
          const ko = button.querySelector('.full-choice-ko');
          const zh = button.querySelector('.full-choice-zh');
          const blank = q.season === 1 && q.options.length === 6 &&
            (option.value === 2 || option.value === 5) && option.ko === '';
          const expectedKo = blank ? '当前客户端此档无韩文文字标签' : option.ko;
          const expectedZh = blank
            ? `${option.value === 2 ? '反对侧' : '赞同侧'} · 第 ${option.value} 档`
            : option.zh;
          if (mark?.textContent !== String(source.optionValues[i])) bad.push(`raw-value-${i}`);
          if (ko?.textContent !== expectedKo || ko?.lang !== (blank ? 'zh-CN' : 'ko')) bad.push(`source-label-${i}`);
          if (zh?.textContent !== expectedZh) bad.push(`draft-label-${i}`);
          if (!(ko?.compareDocumentPosition(zh) & Node.DOCUMENT_POSITION_FOLLOWING)) bad.push(`option-korean-first-${i}`);
        }
        return bad;
      }, { q, source });
      expect(violations, `S${season} at source position ${position + 1}, ID ${q.id}`).toEqual([]);
      checkedOptions += q.options.length;
      // Synthetic in-memory choices only; no POST and no account storage.
      const chosen = page.locator('#full-choices [role="radio"]').nth(position % q.options.length);
      await chosen.click();
      await expect(chosen).toHaveAttribute('aria-checked', 'true');
      await page.locator('#full-next').click();
    }

    expect(checkedOptions).toBe(season === 1 ? 476 : 74);
    await expect(page.locator('#full-done')).toBeVisible();
    await expect(page.locator('#full-done')).toContainText('这里不显示官方分数或嘉宾匹配');
    expect(requests).toEqual([]);
    // Static local-only source trial must not persist sensitive selections.
    expect(await page.evaluate(() => ({
      localKeys: Object.keys(window.localStorage),
      sessionKeys: Object.keys(window.sessionStorage),
    }))).toEqual({ localKeys: [], sessionKeys: [] });
  });
}
