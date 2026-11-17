import test from 'node:test';
import assert from 'node:assert/strict';
import { SEASONS } from '../data/questions.mjs';
import { HISTORY_CONSENT_VERSION, HISTORY_TEST_VERSIONS, toHistoryPayload, validateHistoryPayload, toExportRow } from '../lib/history-contract.mjs';

const requestId = '00000000-0000-4000-8000-000000000001';
function result(season = 2) {
  const source = SEASONS[season];
  return { season, question_version: source.version, scoring_version: source.scoringVersion,
    translation_version: source.questions[0].translation_version, origin: 'independent_demo',
    dimensions: source.axes.map(axis => ({ ...axis, score: 0, count: 2 })) };
}
function payload(season = 2) { return toHistoryPayload(result(season), { consent: true, requestId }); }

test('history catalog covers actual current quiz identities without reinterpreting official scales', () => {
  for (const source of Object.values(SEASONS)) {
    const version = HISTORY_TEST_VERSIONS.find(v => v.season === source.id && v.question_version === source.version);
    assert.ok(version);
    assert.equal(version.scoring_version, source.scoringVersion);
    assert.equal(version.translation_version, source.questions[0].translation_version);
    assert.deepEqual(version.axis_ids, source.axes.map(axis => axis.id));
    assert.equal(version.origin, 'independent_demo');
  }
});

test('active consent produces only minimal immutable-result insert fields', () => {
  for (const season of [1, 2]) {
    const saved = payload(season);
    assert.equal(validateHistoryPayload(saved), true);
    assert.equal(saved.consent_version, HISTORY_CONSENT_VERSION);
    assert.deepEqual(Object.keys(saved).sort(), ['season', 'question_version', 'scoring_version', 'translation_version', 'origin', 'dimensions', 'consent_version', 'client_request_id'].sort());
    assert.ok(saved.dimensions.every(d => Object.keys(d).sort().join(',') === 'id,score'));
  }
  for (const consent of [undefined, false, 'true', 1]) {
    assert.throws(() => toHistoryPayload(result(), { consent, requestId }), /明确同意/);
  }
});

test('untrusted insert fields, raw answers, missing identity, invalid UUIDs and official origins fail closed', () => {
  for (const field of ['owner_id', 'id', 'created_at', 'consented_at', 'answers', 'result_json', 'email']) {
    assert.throws(() => validateHistoryPayload({ ...payload(), [field]: 'synthetic' }), /保存内容/);
  }
  assert.throws(() => toHistoryPayload({ ...result(), answers: {} }, { consent: true, requestId }), /不允许/);
  for (const value of [null, '', 'not-uuid']) assert.throws(() => toHistoryPayload(result(), { consent: true, requestId: value }));
  for (const field of ['season', 'question_version', 'scoring_version', 'translation_version', 'origin', 'dimensions']) {
    const missing = payload(); delete missing[field]; assert.throws(() => validateHistoryPayload(missing));
  }
  assert.throws(() => validateHistoryPayload({ ...payload(), origin: 'licensed_official' }), /不受支持/);
  assert.throws(() => validateHistoryPayload({ ...payload(), question_version: SEASONS[1].version }), /不受支持/);
});

test('exact expected dimensions accept integer endpoints and reject duplicate, missing, extra or nonfinite scores', () => {
  for (const score of [-100, 0, 100]) {
    const saved = payload(); saved.dimensions[0].score = score; assert.equal(validateHistoryPayload(saved), true);
  }
  for (const score of [null, -101, 101, 0.5, NaN, Infinity, '0']) {
    const saved = payload(); saved.dimensions[0].score = score; assert.throws(() => validateHistoryPayload(saved));
  }
  const duplicate = payload(); duplicate.dimensions[1] = duplicate.dimensions[0]; assert.throws(() => validateHistoryPayload(duplicate));
  const missing = payload(); missing.dimensions.pop(); assert.throws(() => validateHistoryPayload(missing));
  const extra = payload(); extra.dimensions[0].answer = 'synthetic'; assert.throws(() => validateHistoryPayload(extra));
});

test('portable export strips internal/auth fields and still supports historical consent versions', () => {
  const row = { ...payload(), id: requestId, owner_id: 'never-export', raw_answers: ['never-export'], email: 'never-export',
    consent_version: 'history-consent-archived-v0', created_at: '2026-10-29T12:00:00.000Z', consented_at: '2026-10-29T12:00:00.000Z' };
  const exported = toExportRow(row);
  assert.equal(exported.consent_version, 'history-consent-archived-v0');
  assert.ok(['id', 'owner_id', 'client_request_id', 'raw_answers', 'email'].every(key => !Object.hasOwn(exported, key)));
  assert.deepEqual(exported.dimensions, payload().dimensions);
  assert.throws(() => toExportRow({ ...row, created_at: 'invalid' }), /记录时间/);
});
