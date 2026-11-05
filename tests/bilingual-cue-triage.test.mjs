import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { triageBilingualCues } from '../scripts/audit-bilingual-cues.mjs';

const pack = loadFullQuestionnaire();

function syntheticFirstQuestion(sourceKo, draftZh) {
  const fixture = structuredClone(pack);
  fixture.seasons[1][0].sourceKo = sourceKo;
  fixture.seasons[1][0].draftZh = draftZh;
  return triageBilingualCues(fixture).items.find(r =>
    r.sourceQuestionId === fixture.seasons[1][0].id);
}

test('flags source negation with no detected target cue without declaring a translation wrong', () => {
  const row = syntheticFirstQuestion('이것이 옳지 않다.', '这样做是正确的。');
  assert.ok(row.targetCueNotDetected.includes('negation'));
  assert.equal(row.priority, 'TARGET_CUE_ABSENT_REVIEW_FIRST');
});

test('finding a target negation cue avoids lexical flag, not independent human review', () => {
  const row = syntheticFirstQuestion('이것이 옳지 않다.', '这样做并不正确。');
  assert.ok(row.sourceCueIds.includes('negation'));
  assert.ok(!row.targetCueNotDetected.includes('negation'));
  const report = triageBilingualCues(pack);
  assert.equal(report.independentlyHumanReviewed, 0);
  assert.equal(report.heuristicResultIsTranslationApproval, false);
  assert.equal(report.allItemsStillRequireIndependentBilingualReview, true);
});

test('absolute and Korean-place deixis are separate reviewer cues', () => {
  const row = syntheticFirstQuestion(
    '우리나라의 모든 사람은 반드시 지켜야 한다.', '我们这里的人应该遵守。',
  );
  assert.deepEqual(row.targetCueNotDetected.sort(), ['absolute_scope', 'korean_deixis']);
});

test('all pinned IDs covered; public report contains no question, translation, option or answer content', () => {
  const report = triageBilingualCues(pack);
  assert.equal(report.sourceQuestionCount, 124);
  assert.equal(report.items.filter(x => x.season === 1).length, 87);
  assert.equal(report.items.filter(x => x.season === 2).length, 37);
  assert.equal(new Set(report.items.map(x => x.sourceQuestionId)).size, 124);
  assert.equal(report.firstPassPriorityCount,
    report.items.filter(x => x.priority !== 'STANDARD_BILINGUAL_CHECK').length);
  assert.equal(report.lexicalCueWithoutTargetCount,
    report.items.filter(x => x.targetCueNotDetected.length).length);
  for (const row of report.items) {
    assert.deepEqual(Object.keys(row).sort(), [
      'priority', 'season', 'sourceCueIds', 'sourceQuestionId', 'targetCueNotDetected',
    ]);
    assert.ok(row.targetCueNotDetected.every(x => row.sourceCueIds.includes(x)));
  }
  const serialized = JSON.stringify(report);
  for (const season of [1, 2]) for (const q of pack.seasons[season]) {
    assert.ok(!serialized.includes(q.sourceKo));
    assert.ok(!serialized.includes(q.draftZh));
    assert.ok(!q.options.some(o => o.ko && serialized.includes(o.ko)));
  }
  assert.throws(() => triageBilingualCues({ seasons: { 1: [], 2: [] } }), /87 S1/);
});
