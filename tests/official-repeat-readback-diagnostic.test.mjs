import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS } from '../data/original-site-audit.mjs';
import { diagnoseExistingRepeatedReadbacks } from '../scripts/diagnose-s2-readback-contradiction.mjs';

const samples = OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS;
const repeated = samples.filter(row =>
  ['3NtECOtE1ebvmN-C', 'EvG6GUuDwVZomdTc', 'UhcZYwxcXKtGKCQA', 'Im8DirzXwGTAQygS', 'aMpgxXI50B7Eqrb-', '1bZs7gslVZmJHN0c', 'amhKSW8ZW7_5flNG']
    .includes(row.publicResultId));
const diagnosticSamples = samples;
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
  assert.equal(repeated.length, 7);
  const result = diagnoseExistingRepeatedReadbacks(diagnosticSamples, fakeLive(), references);
  assert.equal(result.repeatedInputPairs, 21);
  assert.deepEqual(result.readbackClusterSummary, {
    status: 'VERIFIED_EXISTING_READBACKS',
    repeatedInputGroups: 1,
    conflictingInputGroups: 1,
    groups: [{
      observationCount: 7,
      distinctScoreOutputs: 2,
      outputClusterSizesDescending: [6, 1],
      conflicting: true,
      recordedResultOrder: 'KNOWN',
      chronologicalScoreRunSizes: [1, 6],
      chronologicalScoreTransitions: 1,
      oneChronologicalBoundaryObserved: true,
    }],
    majorityDoesNotEstablishGoldStandard: true,
  });
  assert.equal(result.rootCauseEstablished, false);
  assert.equal(result.officialScoringEquivalenceVerified, false);
  assert.deepEqual(result.pairs.map(pair => pair.status), [
    ...Array(6).fill('CONFIRMED_REPEATED_INPUT_CONFLICT'),
    ...Array(15).fill('REPEATED_INPUT_CONSISTENT_ON_RECORDED_FIELDS'),
  ]);
  for (const pair of result.pairs) {
    assert.equal(pair.recordedInputCount, 37);
    assert.equal(pair.versionFieldsMatch, true);
    assert.equal(pair.titleAndSummaryMatch, true);
    assert.equal(pair.createdAtSame, false);
    assert.equal(pair.storedAtSame, false);
    assert.equal(pair.consentVersionSame, true);
    assert.deepEqual(pair.differentOfficialFields,
      pair.status === 'CONFIRMED_REPEATED_INPUT_CONFLICT'
        ? ['axes.원칙-결과.leftPercent', 'axes.원칙-결과.rightPercent'] : []);
  }
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /SECRET_NEVER_OUTPUT|referral|nickname|answers|2026-|publicResultId/);
  assert.doesNotMatch(serialized, /49|42|58|51/);
});

test('readback drift is a hard stop, never an unexamined duplicate-result finding', () => {
  const live = fakeLive();
  const changed = live.get(repeated[1].publicResultId);
  changed.axes[0].leftPercent = 48;
  const driftReport = diagnoseExistingRepeatedReadbacks(diagnosticSamples, live, references);
  assert.equal(driftReport.pairs[0].status, 'BLOCKED_READBACK_DRIFT');
  assert.deepEqual(driftReport.readbackClusterSummary,
    { status: 'BLOCKED_READBACK_DRIFT', groups: [] });
  changed.axes[0].leftPercent = repeated[1].output.axes[0].leftPercent;
  changed.createdAt = 'unexpected';
  assert.equal(diagnoseExistingRepeatedReadbacks(diagnosticSamples, live, references).pairs[0].status,
    'BLOCKED_READBACK_DRIFT');
  changed.createdAt = repeated[1].resultCreatedAt;
  changed.title = 'wrong synthetic display';
  assert.equal(diagnoseExistingRepeatedReadbacks(diagnosticSamples, live, references).pairs[0].status,
    'BLOCKED_READBACK_DRIFT');
});

test('same named official axes in a different JSON order do not create false score clusters', () => {
  const live = fakeLive();
  for (const entry of live.values()) entry.axes.reverse();
  const report = diagnoseExistingRepeatedReadbacks(diagnosticSamples, live, references);
  assert.deepEqual(report.readbackClusterSummary.groups[0].outputClusterSizesDescending, [6, 1]);
  assert.equal(report.readbackClusterSummary.conflictingInputGroups, 1);
});

test('unverified historical responses and private fields never become repeat-input evidence', () => {
  const report = diagnoseExistingRepeatedReadbacks(diagnosticSamples, fakeLive(), references);
  assert.equal(report.repeatedInputPairs, 21);
  assert.equal(samples.filter(row => row.inputVerification === 'unverified').length, 1);
  assert.throws(() => diagnoseExistingRepeatedReadbacks(diagnosticSamples, {}, references), /Map/);
});

test('temporal score split is independent of fixture array order, not a backend-cause conclusion', () => {
  const report = diagnoseExistingRepeatedReadbacks(
    [...diagnosticSamples].reverse(), fakeLive(), references);
  const group = report.readbackClusterSummary.groups[0];
  assert.deepEqual(group.chronologicalScoreRunSizes, [1, 6]);
  assert.equal(group.chronologicalScoreTransitions, 1);
  assert.equal(group.oneChronologicalBoundaryObserved, true);
  assert.equal(report.rootCauseEstablished, false);
});

test('invalid but shape-matching UTC hours cannot create a chronological score claim', () => {
  const altered = structuredClone(diagnosticSamples);
  const a = altered.find(row => row.publicResultId === repeated[0].publicResultId);
  a.resultCreatedAt = '2026-11-05T25:00:00.000Z';
  const live = fakeLive();
  live.get(a.publicResultId).createdAt = a.resultCreatedAt;
  const report = diagnoseExistingRepeatedReadbacks(altered, live, references);
  const group = report.readbackClusterSummary.groups[0];
  assert.equal(group.recordedResultOrder, 'AMBIGUOUS_NONCANONICAL_TIMESTAMPS');
  assert.deepEqual(group.chronologicalScoreRunSizes, []);
  assert.equal(group.chronologicalScoreTransitions, null);
  assert.equal(group.oneChronologicalBoundaryObserved, false);
  assert.equal(report.readbackClusterSummary.conflictingInputGroups, 1);
});

test('impossible calendar dates cannot be used to assert a temporal score split', () => {
  const altered = structuredClone(diagnosticSamples);
  const a = altered.find(row => row.publicResultId === repeated[0].publicResultId);
  a.resultCreatedAt = '2026-02-30T12:00:00.000Z';
  const live = fakeLive();
  live.get(a.publicResultId).createdAt = a.resultCreatedAt;
  const group = diagnoseExistingRepeatedReadbacks(altered, live, references)
    .readbackClusterSummary.groups[0];
  assert.equal(group.recordedResultOrder, 'AMBIGUOUS_NONCANONICAL_TIMESTAMPS');
  assert.deepEqual(group.chronologicalScoreRunSizes, []);
  assert.equal(group.oneChronologicalBoundaryObserved, false);
});

test('duplicate recorded creation times block chronological claims', () => {
  const altered = structuredClone(diagnosticSamples);
  const a = altered.find(row => row.publicResultId === repeated[0].publicResultId);
  const b = altered.find(row => row.publicResultId === repeated[1].publicResultId);
  a.resultCreatedAt = b.resultCreatedAt;
  const live = fakeLive();
  live.get(a.publicResultId).createdAt = a.resultCreatedAt;
  const group = diagnoseExistingRepeatedReadbacks(altered, live, references)
    .readbackClusterSummary.groups[0];
  assert.equal(group.recordedResultOrder, 'AMBIGUOUS_EQUAL_TIMESTAMPS');
  assert.deepEqual(group.chronologicalScoreRunSizes, []);
  assert.equal(group.chronologicalScoreTransitions, null);
  assert.equal(group.oneChronologicalBoundaryObserved, false);
});
