import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS } from '../data/original-site-audit.mjs';
import { diagnoseExistingRepeatedReadbacks } from '../scripts/diagnose-s2-readback-contradiction.mjs';

const samples = OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS;
const repeated = samples.filter(row =>
  ['3NtECOtE1ebvmN-C', 'EvG6GUuDwVZomdTc'].includes(row.publicResultId));
const diagnosticSamples = samples.filter(row =>
  ['3NtECOtE1ebvmN-C', 'EvG6GUuDwVZomdTc'].includes(row.publicResultId));
const sha = text => createHash('sha256').update(text).digest('hex');
const syntheticTitle = '합성 결과 제목';
const syntheticSummary = '테스트용 합성 설명';
const references = Object.fromEntries(repeated.map(row => [row.publicResultId, {
  titleSha256: sha(syntheticTitle),
  summarySha256: sha(syntheticSummary),
}]));

function fakeLive() {
  return new Map(repeated.map((row, index) => [row.publicResultId, {
    ...structuredClone(row.output),
    title: syntheticTitle,
    summary: syntheticSummary,
    createdAt: row.resultCreatedAt,
    storedAt: { _seconds: 1000 + index, _nanoseconds: 100 },
    consentVersion: 'synthetic-only-v1',
    nickname: 'SECRET_NEVER_OUTPUT',
    referralCode: 'SECRET_NEVER_OUTPUT',
    answers: { test: 'SECRET_NEVER_OUTPUT' },
    futurePrivateField: 'SECRET_NEVER_OUTPUT',
    axes: row.output.axes.map(axis => ({
      ...axis,
      leftLabel: axis.id.split('-')[0],
      rightLabel: axis.id.split('-')[1],
    })),
  }]));
}

test('read-only diagnostic pinpoints which official score fields disagree without revealing personal fields', () => {
  assert.equal(repeated.length, 2);
  const result = diagnoseExistingRepeatedReadbacks(diagnosticSamples, fakeLive(), references);
  assert.equal(result.repeatedInputPairs, 1);
  assert.equal(result.rootCauseEstablished, false);
  assert.equal(result.officialScoringEquivalenceVerified, false);
  assert.deepEqual(result.pairs, [{
    status: 'CONFIRMED_REPEATED_INPUT_CONFLICT',
    recordedInputCount: 37,
    differentOfficialFields: [
      'axes.원칙-결과.leftPercent',
      'axes.원칙-결과.rightPercent',
    ],
    versionFieldsMatch: true,
    titleAndSummaryMatch: true,
    createdAtSame: false,
    storedAtSame: false,
    consentVersionSame: true,
  }]);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /SECRET_NEVER_OUTPUT|referral|nickname|answers|2026-|publicResultId/);
  assert.doesNotMatch(serialized, /49|42|58|51/);
});

test('readback drift is a hard stop, never an unexamined duplicate-result finding', () => {
  const live = fakeLive();
  const changed = live.get(repeated[1].publicResultId);
  changed.axes[0].leftPercent = 48;
  assert.equal(diagnoseExistingRepeatedReadbacks(diagnosticSamples, live, references).pairs[0].status,
    'BLOCKED_READBACK_DRIFT');
  changed.axes[0].leftPercent = repeated[1].output.axes[0].leftPercent;
  changed.createdAt = 'unexpected';
  assert.equal(diagnoseExistingRepeatedReadbacks(diagnosticSamples, live, references).pairs[0].status,
    'BLOCKED_READBACK_DRIFT');
  changed.createdAt = repeated[1].resultCreatedAt;
  changed.title = 'wrong synthetic display';
  assert.equal(diagnoseExistingRepeatedReadbacks(diagnosticSamples, live, references).pairs[0].status,
    'BLOCKED_READBACK_DRIFT');
});

test('unverified historical responses and private fields never become repeat-input evidence', () => {
  const report = diagnoseExistingRepeatedReadbacks(diagnosticSamples, fakeLive(), references);
  assert.equal(report.repeatedInputPairs, 1);
  assert.equal(samples.filter(row => row.inputVerification === 'unverified').length, 1);
  assert.throws(() => diagnoseExistingRepeatedReadbacks(diagnosticSamples, {}, references), /Map/);
});
