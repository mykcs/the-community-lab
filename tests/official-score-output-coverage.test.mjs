import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS } from '../data/original-site-audit.mjs';
import { summarizeVerifiedOfficialScoreOutputCoverage } from '../lib/reproduction-audit.mjs';

test('three verified S2 input/output pairs cover two display outcomes, not the scoring space', () => {
  const coverage = summarizeVerifiedOfficialScoreOutputCoverage();
  assert.equal(coverage.verifiedPairs, 3);
  assert.equal(coverage.distinctRecordedOutputSignatures, 2);
  assert.equal(coverage.axesWithAnyNonTie, 1);
  assert.equal(coverage.axesWithBothNonTieSides, 0);
  assert.equal(coverage.axesWithIntensityTwo, 0);
  assert.equal(coverage.officialAlgorithmVerified, false);
  assert.deepEqual(coverage.axisCoverage.map(axis => ({
    id: axis.id, range: axis.leftPercentRange,
    sides: axis.nonTieSides, strengths: axis.observedIntensities,
  })), [
    { id: '원칙-결과', range: [49, 50], sides: ['right'], strengths: [1] },
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
  assert.equal(coverage.verifiedPairs, 3);
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

test('output-only audit must also reject contradictory scores for the same verified input', () => {
  const samples = structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS);
  samples[3].input = structuredClone(samples[2].input);
  // Same source IDs, raw O/X choices and version, but one different axis.
  // Only full-vector parity used to reject this; output coverage stayed misleading.
  assert.throws(() => summarizeVerifiedOfficialScoreOutputCoverage(samples),
    /同一原始答卷.*结果冲突/);
  // A genuine repeated observation with exactly the same score is valid.
  samples[3].output = structuredClone(samples[2].output);
  const coverage = summarizeVerifiedOfficialScoreOutputCoverage(samples);
  assert.equal(coverage.verifiedPairs, 3);
  assert.equal(coverage.distinctRecordedOutputSignatures, 1);
});
