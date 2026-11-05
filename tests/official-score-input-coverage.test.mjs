import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS } from '../data/original-site-audit.mjs';
import { buildVerifiedOfficialScoreFixtures, summarizeVerifiedOfficialScoreInputCoverage } from '../lib/official-score-parity.mjs';

test('verified S2 inputs expose two one-question contrasts and one repeat conflict without proving the scoring algorithm', () => {
  const coverage = summarizeVerifiedOfficialScoreInputCoverage();
  assert.deepEqual(coverage, {
    verifiedPairs: 10,
    questionCount: 37,
    uniqueInputVectors: 4,
    repeatedInputObservations: 6,
    contradictoryInputVectors: 1,
    repeatedInputOutputsConsistent: false,
    questionsObservedWithBothValues: 26,
    questionsObservedWithOnlyOneValue: 11,
    questionsObservedWithNoVerifiedValues: 0,
    comparedInputPairs: 6,
    singleQuestionContrastPairs: 2,
    groupLocalContrastPairs: 1,
    groupLocalContrasts: [
      { sourceGroup: '원칙-결과', differingQuestions: 2, changedScoreAxisIds: ['원칙-결과'] },
    ],
    minPairwiseHammingDistance: 1,
    maxPairwiseHammingDistance: 26,
    officialAlgorithmVerified: false,
  });
});

test('the new official vector differs from the 11-O and 13-O vectors only at rp12 and rp13', () => {
  const samples = buildVerifiedOfficialScoreFixtures(
    OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS.filter(row =>
      !['EvG6GUuDwVZomdTc', 'UhcZYwxcXKtGKCQA', 'Im8DirzXwGTAQygS', 'aMpgxXI50B7Eqrb-', '1bZs7gslVZmJHN0c', 'amhKSW8ZW7_5flNG'].includes(row.publicResultId)));
  const eleven = samples.find(row => row.input.selections.filter(item => item.selectedValue === 'O').length === 11);
  const twelve = samples.find(row => row.publicResultId === '3NtECOtE1ebvmN-C');
  const thirteen = samples.find(row => row.input.selections.filter(item => item.selectedValue === 'O').length === 13);
  const selected = sample => new Map(sample.input.selections.map(row => [row.questionId, row.selectedValue]));
  const diff = (a, b) => [...selected(a)].filter(([id, value]) => selected(b).get(id) !== value)
    .map(([id]) => id).sort();
  assert.ok(eleven && twelve && thirteen);
  assert.deepEqual(diff(eleven, twelve), ['rp12']);
  assert.deepEqual(diff(thirteen, twelve), ['rp13']);
  assert.deepEqual(twelve.expectedOutput.axes.map(({ leftPercent, rightPercent, dominant, intensity }) =>
    [leftPercent, rightPercent, dominant, intensity]), eleven.expectedOutput.axes.map(({ leftPercent, rightPercent, dominant, intensity }) =>
    [leftPercent, rightPercent, dominant, intensity]));
  assert.notDeepEqual(twelve.expectedOutput.axes[0], thirteen.expectedOutput.axes[0]);
  assert.equal(summarizeVerifiedOfficialScoreInputCoverage().officialAlgorithmVerified, false);
});

test('unverified historical results cannot be counted as input diversity', () => {
  const samples = structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS);
  // A fake different score in an output-only record must have no input effect.
  samples[1].output.axes[0].leftPercent = 70;
  samples[1].output.axes[0].rightPercent = 30;
  samples[1].output.axes[0].dominant = '원칙';
  samples[1].output.axes[0].intensity = 2;
  assert.deepEqual(summarizeVerifiedOfficialScoreInputCoverage(samples),
    summarizeVerifiedOfficialScoreInputCoverage());
});

test('a repeated input with a contradictory output remains visible but cannot be a scoring fixture', () => {
  const current = OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS[5];
  const previous = OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS[4];
  assert.deepEqual(current.input, previous.input);
  assert.notDeepEqual(current.output, previous.output);
  assert.equal(current.output.axes[0].leftPercent, 42);
  assert.equal(previous.output.axes[0].leftPercent, 49);
  assert.equal(summarizeVerifiedOfficialScoreInputCoverage().contradictoryInputVectors, 1);
  assert.throws(() => buildVerifiedOfficialScoreFixtures(), /同一原始答卷.*结果冲突/);
});

test('synthetic one-question contrast is detected but does not establish algorithm parity', () => {
  const samples = structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS);
  const group = samples[2].input.questionIdsByChoice;
  samples[3].input = {
    pattern: 'by_question_id',
    questionCount: 37,
    questionIdsByChoice: {
      O: group.O.slice(0, -1),
      X: [...group.X, group.O.at(-1)],
    },
  };
  const result = summarizeVerifiedOfficialScoreInputCoverage(samples);
  assert.equal(result.singleQuestionContrastPairs, 1);
  assert.equal(result.groupLocalContrastPairs, 0,
    'score contrasts involving an input vector with conflicting repeated outputs are excluded');
  assert.equal(result.minPairwiseHammingDistance, 1);
  assert.equal(result.questionsObservedWithBothValues, 25);
  assert.equal(result.officialAlgorithmVerified, false);

  samples[3].output.scoringVersion = 'season-2-score@3';
  assert.throws(() => summarizeVerifiedOfficialScoreInputCoverage(samples),
    /金标准必须属于同一题库与计分版本/);
});

test('no verified inputs means UNKNOWN rather than 37 questions with one value', () => {
  const samples = structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS);
  for (const sample of samples) {
    sample.inputVerification = 'unverified';
    sample.input = null;
  }
  const result = summarizeVerifiedOfficialScoreInputCoverage(samples);
  assert.equal(result.verifiedPairs, 0);
  assert.equal(result.uniqueInputVectors, 0);
  assert.equal(result.questionsObservedWithOnlyOneValue, 0);
  assert.equal(result.questionsObservedWithNoVerifiedValues, 37);
  assert.equal(result.comparedInputPairs, 0);
  assert.equal(result.groupLocalContrastPairs, 0);
  assert.deepEqual(result.groupLocalContrasts, []);
  assert.equal(result.minPairwiseHammingDistance, null);
  assert.equal(result.officialAlgorithmVerified, false);
});

test('identical source choices with contradictory official scores are reported and rejected as fixtures', () => {
  const samples = structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS);
  // Synthesize a duplicate verified input with a DIFFERENT official readback.
  // Existing evidence has no such contradiction; this is a fail-closed guard.
  samples[3].input = structuredClone(samples[2].input);
  assert.equal(summarizeVerifiedOfficialScoreInputCoverage(samples).contradictoryInputVectors, 2);
  assert.throws(() => buildVerifiedOfficialScoreFixtures(samples), /同一原始答卷.*结果冲突/);
});
