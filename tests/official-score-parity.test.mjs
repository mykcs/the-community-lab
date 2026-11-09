import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS } from '../data/original-site-audit.mjs';
import SOURCE_INDEX from '../data/original-question-index.json' with { type: 'json' };
import {
  buildVerifiedOfficialScoreFixtures,
  compareRecordedOfficialScoreFields,
  compareCandidateAgainstRecordedOfficialPairs,
} from '../lib/official-score-parity.mjs';

const repeatedConflictIds = new Set([
  'EvG6GUuDwVZomdTc', 'UhcZYwxcXKtGKCQA', 'Im8DirzXwGTAQygS', 'aMpgxXI50B7Eqrb-',
  '1bZs7gslVZmJHN0c', 'amhKSW8ZW7_5flNG',
]);
const stableObservations = OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS
  .filter(row => !repeatedConflictIds.has(row.publicResultId));
const fixtures = buildVerifiedOfficialScoreFixtures(stableObservations);

test('only verified S2 synthetic inputs become frozen, complete source-ID/raw-value fixtures', () => {
  assert.equal(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS.length, 11);
  assert.equal(fixtures.length, 4);
  const source = SOURCE_INDEX.questions.filter(q => q.season === 2)
    .sort((a, b) => a.displayPositionDerivedFromClient - b.displayPositionDerivedFromClient);
  const allowed = new Map(source.map(q => [q.sourceQuestionId, q.optionValues]));
  for (const fixture of fixtures) {
    assert.equal(fixture.input.season, 2);
    assert.equal(fixture.input.sourceAssetSha256, SOURCE_INDEX.sourceAssetSha256);
    assert.equal(fixture.input.questionSetHash, '2e4ed483b6b79197');
    assert.equal(fixture.input.scoringVersion, 'season-2-score@2');
    assert.equal(fixture.input.selections.length, 37);
    assert.equal(new Set(fixture.input.selections.map(row => row.questionId)).size, 37);
    assert.deepEqual(fixture.input.selections.map(row => row.questionId), source.map(q => q.sourceQuestionId));
    for (const row of fixture.input.selections) {
      assert.ok(allowed.get(row.questionId)?.includes(row.selectedValue));
      assert.ok(Object.isFrozen(row));
    }
    assert.ok(Object.isFrozen(fixture.input.selections));
    assert.ok(Object.isFrozen(fixture.input));
    assert.deepEqual(Object.keys(fixture), ['publicResultId', 'input', 'expectedOutput']);
  }
  const [uniform, sourceGroup, elevenPrincipleO, twelvePrincipleO] = fixtures;
  assert.ok(uniform.input.selections.every(row => row.selectedValue === 'O'));
  assert.equal(sourceGroup.input.selections.filter(row => row.selectedValue === 'O').length, 13);
  assert.equal(elevenPrincipleO.input.selections.filter(row => row.selectedValue === 'O').length, 11);
  assert.equal(twelvePrincipleO.input.selections.filter(row => row.selectedValue === 'O').length, 12);
  assert.deepEqual(sourceGroup.input.selections.filter(row => row.selectedValue !==
    elevenPrincipleO.input.selections.find(other => other.questionId === row.questionId).selectedValue)
    .map(row => row.questionId).sort(), ['rp12', 'rp13']);
  assert.deepEqual(elevenPrincipleO.input.selections.filter(row => row.selectedValue !==
    twelvePrincipleO.input.selections.find(other => other.questionId === row.questionId).selectedValue)
    .map(row => row.questionId), ['rp12']);
  assert.deepEqual(sourceGroup.input.selections.filter(row => row.selectedValue !==
    twelvePrincipleO.input.selections.find(other => other.questionId === row.questionId).selectedValue)
    .map(row => row.questionId), ['rp13']);
  assert.deepEqual(compareRecordedOfficialScoreFields(elevenPrincipleO.expectedOutput,
    twelvePrincipleO.expectedOutput), { matches: true, mismatches: [] });
  assert.equal(compareRecordedOfficialScoreFields(sourceGroup.expectedOutput,
    twelvePrincipleO.expectedOutput).matches, false);
  assert.throws(() => { fixtures[0].input.selections[0].selectedValue = 'X'; }, TypeError);
  assert.ok(!fixtures.some(row => row.publicResultId === '0JR4VZqW4PrpCqv7'),
    'never infer an unverified historical answer vector from its official output');
});

test('official fixtures refuse source-index reordering or raw-value drift even with 37 valid rows', () => {
  const changedOrder = structuredClone(SOURCE_INDEX);
  const rows = changedOrder.questions.filter(q => q.season === 2)
    .sort((a, b) => a.displayPositionDerivedFromClient - b.displayPositionDerivedFromClient);
  [rows[0].displayPositionDerivedFromClient, rows[1].displayPositionDerivedFromClient] =
    [rows[1].displayPositionDerivedFromClient, rows[0].displayPositionDerivedFromClient];
  // Both rows remain structurally valid and all 37 questions still exist;
  // silently accepting the swapped order would corrupt input→output evidence.
  assert.throws(() => buildVerifiedOfficialScoreFixtures(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS, changedOrder),
    /源题元数据指纹不匹配/);

  const changedValueOrder = structuredClone(SOURCE_INDEX);
  changedValueOrder.questions.find(q => q.season === 2).optionValues.reverse();
  assert.throws(() => buildVerifiedOfficialScoreFixtures(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS, changedValueOrder),
    /源题元数据指纹不匹配/);
  assert.equal(buildVerifiedOfficialScoreFixtures(stableObservations).length, 4, 'consistent historical subset remains usable');
});

test('official score fixtures detach and deeply freeze expected outputs', () => {
  const observations = structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS);
  const snapshots = buildVerifiedOfficialScoreFixtures(
    observations.filter(row => !repeatedConflictIds.has(row.publicResultId)));
  const gold = snapshots[0].expectedOutput;
  const before = structuredClone(gold);
  assert.notStrictEqual(gold, observations[0].output);
  assert.notStrictEqual(gold.axes, observations[0].output.axes);
  assert.notStrictEqual(gold.axes[0], observations[0].output.axes[0]);
  assert.ok(Object.isFrozen(gold));
  assert.ok(Object.isFrozen(gold.axes));
  assert.ok(gold.axes.every(Object.isFrozen));
  assert.throws(() => { gold.resultType = 'changed'; }, TypeError);
  assert.throws(() => { gold.axes[0].leftPercent = 99; }, TypeError);
  assert.throws(() => { gold.axes.pop(); }, TypeError);
  observations[0].output.resultType = 'external-edit';
  observations[0].output.axes[0].leftPercent = 99;
  assert.deepEqual(gold, before, 'mutating mutable source evidence must not rewrite the frozen gold');
  assert.deepEqual(compareRecordedOfficialScoreFields(before, gold), { matches: true, mismatches: [] });
});

test('official comparisons cover every public field exactly, regardless of axis order', () => {
  const expected = fixtures[0].expectedOutput;
  assert.deepEqual(compareRecordedOfficialScoreFields(expected, structuredClone(expected)),
    { matches: true, mismatches: [] });
  const shuffled = structuredClone(expected);
  shuffled.axes.reverse();
  assert.equal(compareRecordedOfficialScoreFields(expected, shuffled).matches, true);
  for (const field of ['season', 'questionnaireVersion', 'questionSetHash', 'scoringVersion', 'resultType']) {
    const bad = structuredClone(expected);
    bad[field] = 'not-the-official-value';
    assert.deepEqual(compareRecordedOfficialScoreFields(expected, bad).mismatches, [field]);
  }
  for (const field of ['leftPercent', 'rightPercent', 'dominant', 'intensity']) {
    const bad = structuredClone(expected);
    bad.axes[0][field] = field === 'dominant' ? '结果' : bad.axes[0][field] + 1;
    assert.deepEqual(compareRecordedOfficialScoreFields(expected, bad).mismatches, [`axes.원칙-결과.${field}`]);
  }
  const missing = structuredClone(expected);
  missing.axes.pop();
  assert.ok(compareRecordedOfficialScoreFields(expected, missing).mismatches.includes('axes.의미-실리.missing'));
  const duplicated = structuredClone(expected);
  duplicated.axes[1] = { ...duplicated.axes[0] };
  assert.ok(compareRecordedOfficialScoreFields(expected, duplicated).mismatches.includes('axes.duplicateId'));
  assert.deepEqual(compareRecordedOfficialScoreFields(expected, null),
    { matches: false, mismatches: ['result'] });
});

test('absent scorer is an explicit block, never a vacuous 0/0 success', async () => {
  const result = await compareCandidateAgainstRecordedOfficialPairs(null, stableObservations);
  assert.equal(result.status, 'BLOCKED_NO_LOCAL_OFFICIAL_SCORER');
  assert.equal(result.availableVerifiedPairs, 4);
  assert.equal(result.comparedPairs, 0);
  assert.equal(result.allRecordedPairsMatch, false);
  assert.equal(result.officialAlgorithmVerified, false);
  assert.deepEqual(result.cases, []);
});

test('conflicting official readbacks block even a test candidate from using a deterministic gold set', async () => {
  const result = await compareCandidateAgainstRecordedOfficialPairs(() => ({}));
  assert.equal(result.status, 'BLOCKED_CONTRADICTORY_OFFICIAL_READBACKS');
  assert.equal(result.availableVerifiedPairs, 0);
  assert.equal(result.observedVerifiedPairs, 10);
  assert.equal(result.contradictoryInputVectors, 1);
  assert.equal(result.comparedPairs, 0);
  assert.equal(result.officialAlgorithmVerified, false);
});

test('test-only candidate can match recorded cases but NEVER prove general official equivalence', async () => {
  // This is deliberately a fixture lookup, NOT a scoring formula. Its only
  // purpose is to test differential reporting and the permanent false claim gate.
  const outputsByInput = new Map(fixtures.map(fixture => [
    JSON.stringify(fixture.input.selections), fixture.expectedOutput,
  ]));
  const result = await compareCandidateAgainstRecordedOfficialPairs(input =>
    outputsByInput.get(JSON.stringify(input.selections)), stableObservations);
  assert.equal(result.status, 'RECORDED_NUMERIC_SAMPLE_MATCH_DISPLAY_UNVERIFIED');
  assert.equal(result.comparedPairs, 4);
  assert.equal(result.allRecordedNumericFieldsMatch, true);
  assert.equal(result.allRecordedPairsMatch, false);
  assert.equal(result.officialAlgorithmVerified, false);
  assert.ok(result.cases.every(row => !row.matches && row.numericMatches &&
    row.displayStatus === 'NOT_PROVIDED' &&
    row.mismatches.join() === 'officialDisplay.notProvided'));
  assert.deepEqual(result.cases.map(row => row.publicResultId), fixtures.map(row => row.publicResultId));

  const wrong = await compareCandidateAgainstRecordedOfficialPairs(() => fixtures[0].expectedOutput, stableObservations);
  assert.equal(wrong.status, 'RECORDED_SAMPLE_MISMATCH');
  assert.equal(wrong.allRecordedPairsMatch, false);
  assert.ok(wrong.cases[2].mismatches.includes('resultType'));
  assert.ok(wrong.cases[2].mismatches.includes('axes.원칙-결과.leftPercent'));
});

test('candidate exceptions fail closed and cannot leak exception messages into audit rows', async () => {
  const result = await compareCandidateAgainstRecordedOfficialPairs(() => {
    throw new Error('do-not-copy-a-private-answer');
  }, stableObservations);
  assert.equal(result.status, 'RECORDED_SAMPLE_MISMATCH');
  assert.equal(result.comparedPairs, 4);
  assert.ok(result.cases.every(row => !row.matches &&
    row.mismatches.join() === 'candidateScore.threw'));
  assert.doesNotMatch(JSON.stringify(result), /do-not-copy-a-private-answer/);
  await assert.rejects(compareCandidateAgainstRecordedOfficialPairs({}, stableObservations), TypeError);
  const source = readFileSync(new URL('../lib/official-score-parity.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|sendBeacon)\s*\(|api\/v1\/results/);
});

test('forged source display text cannot pass full official-result acceptance even with exact score fields', async () => {
  const fakeText = 'synthetic-false-official-title-no-personal-data';
  const resultsByInput = new Map(fixtures.map(fixture => [
    JSON.stringify(fixture.input.selections), fixture.expectedOutput,
  ]));
  const result = await compareCandidateAgainstRecordedOfficialPairs(input => {
    const original = resultsByInput.get(JSON.stringify(input.selections));
    return {
      ...original,
      // A Chinese result title may differ; only an explicitly declared
      // Korean-source claim is compared against the recorded Korean digests.
      title: '合成中文标题，不作为韩文来源指纹',
      summary: '合成中文解释，未经过独立双语审校',
      sourceKoreanDisplay: {
        title: fakeText,
        summary: fakeText,
        axes: original.axes.map(axis => ({
          id: axis.id,
          leftLabel: axis.id.split('-')[0],
          rightLabel: axis.id.split('-')[1],
        })),
      },
    };
  }, stableObservations);
  assert.equal(result.status, 'RECORDED_SAMPLE_MISMATCH');
  assert.equal(result.allRecordedNumericFieldsMatch, true);
  assert.equal(result.allRecordedPairsMatch, false);
  assert.ok(result.cases.every(row => row.numericMatches && !row.matches &&
    row.displayStatus === 'MISMATCH' &&
    row.mismatches.includes('title.sha256') &&
    row.mismatches.includes('summary.sha256')));
  assert.doesNotMatch(JSON.stringify(result), /synthetic-false-official-title-no-personal-data/);
});
