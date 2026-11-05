import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS } from '../data/original-site-audit.mjs';
import { buildVerifiedOfficialScoreFixtures, summarizeVerifiedOfficialScoreInputCoverage } from '../lib/official-score-parity.mjs';

test('verified S2 inputs expose two one-question contrasts without proving the scoring algorithm', () => {
  const coverage = summarizeVerifiedOfficialScoreInputCoverage();
  assert.deepEqual(coverage, {
    verifiedPairs: 4,
    questionCount: 37,
    uniqueInputVectors: 4,
    questionsObservedWithBothValues: 26,
    questionsObservedWithOnlyOneValue: 11,
    questionsObservedWithNoVerifiedValues: 0,
    comparedInputPairs: 6,
    singleQuestionContrastPairs: 2,
    groupLocalContrastPairs: 3,
    groupLocalContrasts: [
      { sourceGroup: '원칙-결과', differingQuestions: 2, changedScoreAxisIds: ['원칙-결과'] },
      { sourceGroup: '원칙-결과', differingQuestions: 1, changedScoreAxisIds: ['원칙-결과'] },
      { sourceGroup: '원칙-결과', differingQuestions: 1, changedScoreAxisIds: [] },
    ],
    minPairwiseHammingDistance: 1,
    maxPairwiseHammingDistance: 26,
    officialAlgorithmVerified: false,
  });
});

test('the new official vector differs from the 11-O and 13-O vectors only at rp12 and rp13', () => {
  const samples = buildVerifiedOfficialScoreFixtures();
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

test('duplicate verified input lowers diversity instead of inflating coverage', () => {
  const samples = structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS);
  samples[4].input = structuredClone(samples[3].input);
  // A repeated official input may corroborate reliability only with the same output.
  samples[4].output = structuredClone(samples[3].output);
  const result = summarizeVerifiedOfficialScoreInputCoverage(samples);
  assert.equal(result.verifiedPairs, 4);
  assert.equal(result.uniqueInputVectors, 3);
  assert.equal(result.questionsObservedWithBothValues, 26);
  assert.equal(result.questionsObservedWithOnlyOneValue, 11);
  assert.equal(result.comparedInputPairs, 3);
  assert.equal(result.groupLocalContrastPairs, 1, 'a repeated input cannot invent a group-local contrast');
  assert.equal(result.minPairwiseHammingDistance, 2);
  assert.equal(result.maxPairwiseHammingDistance, 26);
});

test('repeating a verified input cannot manufacture new independent contrast pairs', () => {
  const samples = structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS);
  samples[4].input = structuredClone(samples[3].input);
  samples[4].output = structuredClone(samples[3].output);
  const coverage = summarizeVerifiedOfficialScoreInputCoverage(samples);
  assert.equal(coverage.verifiedPairs, 4, 'repeats remain auditable as observations');
  assert.equal(coverage.uniqueInputVectors, 3);
  assert.equal(coverage.comparedInputPairs, 3, 'only three distinct vectors yield independent contrasts');
  assert.equal(coverage.singleQuestionContrastPairs, 0);
  assert.equal(coverage.minPairwiseHammingDistance, 2);
  assert.equal(coverage.maxPairwiseHammingDistance, 26);
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
  assert.ok(result.groupLocalContrasts.some(row =>
    row.sourceGroup === '원칙-결과' && row.differingQuestions === 1));
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

test('identical source choices with contradictory official scores are rejected as a gold standard', () => {
  const samples = structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS);
  // Synthesize a duplicate verified input with a DIFFERENT official readback.
  // Existing evidence has no such contradiction; this is a fail-closed guard.
  samples[3].input = structuredClone(samples[2].input);
  assert.throws(() => summarizeVerifiedOfficialScoreInputCoverage(samples),
    /同一原始答卷.*结果冲突/);
});
