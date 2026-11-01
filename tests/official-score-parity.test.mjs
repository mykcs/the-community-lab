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

const fixtures = buildVerifiedOfficialScoreFixtures();

test('only verified S2 synthetic inputs become frozen, complete source-ID/raw-value fixtures', () => {
  assert.equal(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS.length, 4);
  assert.equal(fixtures.length, 3);
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
  const [uniform, sourceGroup, partialGroup] = fixtures;
  assert.ok(uniform.input.selections.every(row => row.selectedValue === 'O'));
  assert.equal(sourceGroup.input.selections.filter(row => row.selectedValue === 'O').length, 13);
  assert.equal(partialGroup.input.selections.filter(row => row.selectedValue === 'O').length, 11);
  assert.deepEqual(sourceGroup.input.selections.filter(row => row.selectedValue !==
    partialGroup.input.selections.find(other => other.questionId === row.questionId).selectedValue)
    .map(row => row.questionId).sort(), ['rp12', 'rp13']);
  assert.throws(() => { fixtures[0].input.selections[0].selectedValue = 'X'; }, TypeError);
  assert.ok(!fixtures.some(row => row.publicResultId === '0JR4VZqW4PrpCqv7'),
    'never infer an unverified historical answer vector from its official output');
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
  const result = await compareCandidateAgainstRecordedOfficialPairs();
  assert.equal(result.status, 'BLOCKED_NO_LOCAL_OFFICIAL_SCORER');
  assert.equal(result.availableVerifiedPairs, 3);
  assert.equal(result.comparedPairs, 0);
  assert.equal(result.allRecordedPairsMatch, false);
  assert.equal(result.officialAlgorithmVerified, false);
  assert.deepEqual(result.cases, []);
});

test('test-only candidate can match recorded cases but NEVER prove general official equivalence', async () => {
  // This is deliberately a fixture lookup, NOT a scoring formula. Its only
  // purpose is to test differential reporting and the permanent false claim gate.
  const outputsByInput = new Map(fixtures.map(fixture => [
    JSON.stringify(fixture.input.selections), fixture.expectedOutput,
  ]));
  const result = await compareCandidateAgainstRecordedOfficialPairs(input =>
    outputsByInput.get(JSON.stringify(input.selections)));
  assert.equal(result.status, 'RECORDED_SAMPLE_MATCH_ONLY');
  assert.equal(result.comparedPairs, 3);
  assert.equal(result.allRecordedPairsMatch, true);
  assert.equal(result.officialAlgorithmVerified, false);
  assert.ok(result.cases.every(row => row.matches));
  assert.deepEqual(result.cases.map(row => row.publicResultId), fixtures.map(row => row.publicResultId));

  const wrong = await compareCandidateAgainstRecordedOfficialPairs(() => fixtures[0].expectedOutput);
  assert.equal(wrong.status, 'RECORDED_SAMPLE_MISMATCH');
  assert.equal(wrong.allRecordedPairsMatch, false);
  assert.ok(wrong.cases[2].mismatches.includes('resultType'));
  assert.ok(wrong.cases[2].mismatches.includes('axes.원칙-결과.leftPercent'));
});

test('candidate exceptions fail closed and cannot leak exception messages into audit rows', async () => {
  const result = await compareCandidateAgainstRecordedOfficialPairs(() => {
    throw new Error('do-not-copy-a-private-answer');
  });
  assert.equal(result.status, 'RECORDED_SAMPLE_MISMATCH');
  assert.equal(result.comparedPairs, 3);
  assert.ok(result.cases.every(row => !row.matches &&
    row.mismatches.join() === 'candidateScore.threw'));
  assert.doesNotMatch(JSON.stringify(result), /do-not-copy-a-private-answer/);
  await assert.rejects(compareCandidateAgainstRecordedOfficialPairs({}), TypeError);
  const source = readFileSync(new URL('../lib/official-score-parity.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|sendBeacon)\s*\(|api\/v1\/results/);
});
