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

test('flags a changed answer caption without treating the source value as an actual response', () => {
  const fixture = structuredClone(pack);
  const q = fixture.seasons[1][0];
  // The frozen scale's first source caption includes absolute and negative
  // cues. A deliberately contradictory synthetic Chinese caption must be
  // flagged even though the question stem remains untouched.
  q.options[0].zh = '符合';
  const report = triageBilingualCues(fixture);
  const row = report.items.find(item => item.sourceQuestionId === q.id);
  assert.equal(row.priority, 'TARGET_CUE_ABSENT_REVIEW_FIRST');
  assert.deepEqual(row.optionTargetCueNotDetected, [{
    sourceOptionValue: 1,
    sourceCueIds: ['negation', 'absolute_scope'],
    targetCueNotDetected: ['negation', 'absolute_scope'],
  }]);
  assert.equal(report.sourceOptionCount, 550);
  assert.equal(report.optionLexicalCueWithoutTargetCount, 1);
  assert.ok(!JSON.stringify(report).includes(q.options[0].ko));
  assert.ok(!JSON.stringify(report).includes(q.options[0].zh));
});

test('genuinely empty Korean S1 scale captions are not invented or flagged', () => {
  const report = triageBilingualCues(pack);
  assert.equal(report.sourceOptionCount, 550);
  assert.equal(report.optionLexicalCueWithoutTargetCount, 0);
  assert.equal(report.firstPassPriorityCount, 27);
  const blank = pack.seasons[1].find(q => q.options.length === 6);
  assert.equal(blank.options.find(o => o.value === 2).ko, '');
  assert.equal(blank.options.find(o => o.value === 5).ko, '');
  const row = report.items.find(q => q.sourceQuestionId === blank.id);
  assert.deepEqual(row.optionTargetCueNotDetected, []);
  const bad = structuredClone(pack);
  bad.seasons[1][0].options[0].zh = '';
  assert.throws(() => triageBilingualCues(bad), /Invalid bilingual option fields/);
});

test('absolute and Korean-place deixis are separate reviewer cues', () => {
  const row = syntheticFirstQuestion(
    '우리나라의 모든 사람은 반드시 지켜야 한다.', '我们这里的人应该遵守。',
  );
  assert.deepEqual(row.targetCueNotDetected.sort(), ['absolute_scope', 'korean_deixis']);
});

test('all pinned IDs covered; public report contains no question, translation, option or answer content', () => {
  const report = triageBilingualCues(pack);
  assert.equal(report.schema, 'bilingual-cue-triage@2');
  assert.equal(report.sourceQuestionCount, 124);
  assert.equal(report.sourceOptionCount, 550);
  assert.equal(report.optionLexicalCueWithoutTargetCount, 0);
  assert.equal(report.items.filter(x => x.season === 1).length, 87);
  assert.equal(report.items.filter(x => x.season === 2).length, 37);
  assert.equal(new Set(report.items.map(x => x.sourceQuestionId)).size, 124);
  assert.equal(report.firstPassPriorityCount,
    report.items.filter(x => x.priority !== 'STANDARD_BILINGUAL_CHECK').length);
  assert.equal(report.lexicalCueWithoutTargetCount,
    report.items.filter(x => x.targetCueNotDetected.length).length);
  for (const row of report.items) {
    assert.deepEqual(Object.keys(row).sort(), [
      'optionTargetCueNotDetected', 'priority', 'season', 'sourceCueIds', 'sourceQuestionId', 'targetCueNotDetected',
    ]);
    assert.ok(row.targetCueNotDetected.every(x => row.sourceCueIds.includes(x)));
    for (const option of row.optionTargetCueNotDetected) {
      assert.deepEqual(Object.keys(option).sort(), ['sourceCueIds', 'sourceOptionValue', 'targetCueNotDetected']);
      assert.ok(option.targetCueNotDetected.every(x => option.sourceCueIds.includes(x)));
    }
  }
  const serialized = JSON.stringify(report);
  for (const season of [1, 2]) for (const q of pack.seasons[season]) {
    assert.ok(!serialized.includes(q.sourceKo));
    assert.ok(!serialized.includes(q.draftZh));
    assert.ok(!q.options.some(o => o.ko && serialized.includes(o.ko)));
  }
  assert.throws(() => triageBilingualCues({ seasons: { 1: [], 2: [] } }), /87 S1/);
});
