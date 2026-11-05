import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS } from '../data/original-site-audit.mjs';
import { summarizeVerifiedOfficialScoreOutputCoverage } from '../lib/reproduction-audit.mjs';

test('nine verified S2 readbacks expose three display outcomes and a repeated-input conflict', () => {
  const coverage = summarizeVerifiedOfficialScoreOutputCoverage();
  assert.equal(coverage.verifiedPairs, 9);
  assert.equal(coverage.repeatedInputObservations, 5);
  assert.equal(coverage.contradictoryInputVectors, 1);
  assert.equal(coverage.distinctRecordedOutputSignatures, 3);
  assert.equal(coverage.axesWithAnyNonTie, 1);
  assert.equal(coverage.axesWithBothNonTieSides, 0);
  assert.equal(coverage.axesWithIntensityTwo, 0);
  assert.equal(coverage.officialAlgorithmVerified, false);
  assert.deepEqual(coverage.axisCoverage.map(axis => ({
    id: axis.id, range: axis.leftPercentRange,
    sides: axis.nonTieSides, strengths: axis.observedIntensities,
  })), [
    { id: '원칙-결과', range: [42, 50], sides: ['right'], strengths: [1] },
    { id: '구조-능력', range: [50, 50], sides: [], strengths: [1] },
    { id: '의미-실리', range: [50, 50], sides: [], strengths: [1] },
  ]);
});

test('an unverified historical input does not add coverage even if its output is extreme', () => {
  const samples = structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS);
  samples[1].output = structuredClone(samples[1].output);
  samples[1].output.axes[0] = { ...samples[1].output.axes[0],
    leftPercent: 90, rightPercent: 10, intensity: 2 };
  const coverage = summarizeVerifiedOfficialScoreOutputCoverage(samples);
  assert.equal(coverage.verifiedPairs, 9);
  assert.equal(coverage.axesWithIntensityTwo, 0);
  assert.equal(coverage.axesWithBothNonTieSides, 0);
});

test('more diverse same-version synthetic evidence affects coverage, never establishes parity', () => {
  const samples = structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS);
  samples[0].output = structuredClone(samples[0].output);
  samples[0].output.axes[0] = { ...samples[0].output.axes[0],
    leftPercent: 80, rightPercent: 20, intensity: 2 };
  const coverage = summarizeVerifiedOfficialScoreOutputCoverage(samples);
  assert.equal(coverage.axesWithIntensityTwo, 1);
  assert.equal(coverage.axesWithBothNonTieSides, 1);
  assert.equal(coverage.officialAlgorithmVerified, false);
  samples[0].output.scoringVersion = 'season-2-score@3';
  assert.throws(() => summarizeVerifiedOfficialScoreOutputCoverage(samples), /不能跨题库或评分版本/);
});

test('output-only coverage counts and identifies contradictory scores for the same verified input', () => {
  const samples = structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS);
  const originalElevenInput = structuredClone(samples[3].input);
  const originalElevenOutput = structuredClone(samples[3].output);
  samples[3].input = structuredClone(samples[2].input);
  // Same source IDs, raw O/X choices and version, but one different axis.
  // Coverage reports this conflict; strict parity fixtures fail closed.
  const conflicting = summarizeVerifiedOfficialScoreOutputCoverage(samples);
  assert.equal(conflicting.contradictoryInputVectors, 2);
  assert.equal(conflicting.repeatedInputObservations, 6);
  samples[3].input = originalElevenInput;
  samples[3].output = originalElevenOutput;
  for (const index of [4, 5, 6, 7, 8, 9]) {
    samples[index].input = structuredClone(samples[3].input);
    samples[index].output = structuredClone(samples[3].output);
  }
  const coverage = summarizeVerifiedOfficialScoreOutputCoverage(samples);
  assert.equal(coverage.verifiedPairs, 9);
  assert.equal(coverage.contradictoryInputVectors, 0);
  assert.equal(coverage.distinctRecordedOutputSignatures, 2);
});
