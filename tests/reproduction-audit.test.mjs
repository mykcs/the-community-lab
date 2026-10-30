import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEASONS } from '../data/questions.mjs';
import { ORIGINAL_SITE_AUDIT } from '../data/original-site-audit.mjs';
import { buildReproductionAudit } from '../lib/reproduction-audit.mjs';
import { scoreAnswers } from '../lib/quiz.mjs';

test('homepage distinguishes user-reported reuse permission from independent verification', () => {
  const homepage = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
  assert.match(homepage, /用户报告已获当前公开材料的官方非营利翻译许可/);
  assert.match(homepage, /许可原件未独立核验/);
  assert.match(homepage, /正式译文与官方计分仍待核验/);
  assert.doesNotMatch(homepage, /原题转载许可[^。]*仍待核验/);
});

test('source item counts and independent demo item counts are never conflated', () => {
  const audit = buildReproductionAudit();
  assert.equal(audit.originalEquivalenceVerified, false);
  assert.deepEqual(audit.rows.map(x => [x.sourceObservedQuestionCount, x.independentDemoQuestionCount]), [[87, 8], [37, 6]]);
  assert.ok(audit.rows.every(x => !x.reproductionReady));
  assert.ok(audit.rows.every(x => !x.originalBranchingVerified && !x.originalScoringVerified));
});

test('a coincidentally equal question count cannot validate an official reproduction', () => {
  const inflated = structuredClone(SEASONS);
  inflated[1].questions = Array.from({ length: 87 }, (_, i) => ({
    ...inflated[1].questions[i % inflated[1].questions.length],
    id: 'demo-' + i,
  }));
  const audit = buildReproductionAudit(inflated, ORIGINAL_SITE_AUDIT);
  assert.equal(audit.rows[0].sourceObservedQuestionCount, 87);
  assert.equal(audit.rows[0].independentDemoQuestionCount, 87);
  assert.equal(audit.rows[0].reproductionReady, false);
});

test('source status flags cannot promote a full-sized independent demo into an official reproduction', () => {
  const demos = structuredClone(SEASONS);
  const evidence = structuredClone(ORIGINAL_SITE_AUDIT);
  for (const id of [1, 2]) {
    const original = demos[id].questions;
    demos[id].questions = Array.from({ length: evidence[id].observedQuestionCount }, (_, i) => ({
      ...original[i % original.length], id: `demo-${i}`,
    }));
    Object.assign(evidence[id], {
      questionTextReusePermission: 'verified', questionIdentityCoverage: 'verified_complete',
      answerBranchingCoverage: 'verified_complete', scoringAgreement: 'validated_against_original',
    });
  }
  const audit = buildReproductionAudit(demos, evidence);
  assert.equal(audit.originalEquivalenceVerified, false);
  assert.ok(audit.rows.every(row => !row.reproductionReady));
});

test('exhaustively exercise every independent-demo answer vector, without implying official scoring correctness', () => {
  for (const season of Object.values(SEASONS)) {
    const values = season.questions.map(q => q.options.map(o => o.value));
    const combinations = values.reduce((total, v) => total * v.length, 1);
    let checked = 0;
    for (let mask = 0; mask < combinations; mask++) {
      let current = mask;
      const answers = {};
      for (let i = 0; i < values.length; i++) {
        const choices = values[i];
        answers[season.questions[i].id] = choices[current % choices.length];
        current = Math.floor(current / choices.length);
      }
      const result = scoreAnswers(season, answers);
      assert.equal(result.origin, 'independent_demo');
      assert.ok(result.dimensions.every(d => Number.isInteger(d.score) && d.score >= -100 && d.score <= 100));
      checked++;
    }
    assert.equal(checked, season.id === 1 ? 65_536 : 64);
  }
});
