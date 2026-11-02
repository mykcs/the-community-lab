import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS } from '../data/original-site-audit.mjs';
import { summarizeVerifiedOfficialScoreInputCoverage } from '../lib/official-score-parity.mjs';

test('verified S2 inputs do not contain any isolated one-question score contrast', () => {
  const coverage = summarizeVerifiedOfficialScoreInputCoverage();
  assert.deepEqual(coverage, {
    verifiedPairs: 3,
    questionCount: 37,
    uniqueInputVectors: 3,
    questionsObservedWithBothValues: 26,
    questionsObservedWithOnlyOneValue: 11,
    questionsObservedWithNoVerifiedValues: 0,
    comparedInputPairs: 3,
    singleQuestionContrastPairs: 0,
    minPairwiseHammingDistance: 2,
    maxPairwiseHammingDistance: 26,
    officialAlgorithmVerified: false,
  });
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
  samples[3].input = structuredClone(samples[2].input);
  const result = summarizeVerifiedOfficialScoreInputCoverage(samples);
  assert.equal(result.verifiedPairs, 3);
  assert.equal(result.uniqueInputVectors, 2);
  assert.equal(result.questionsObservedWithBothValues, 24);
  assert.equal(result.questionsObservedWithOnlyOneValue, 13);
  assert.equal(result.minPairwiseHammingDistance, 0);
  assert.equal(result.maxPairwiseHammingDistance, 24);
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
  assert.equal(result.minPairwiseHammingDistance, null);
  assert.equal(result.officialAlgorithmVerified, false);
});
