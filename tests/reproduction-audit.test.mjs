import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEASONS } from '../data/questions.mjs';
import { ORIGINAL_SITE_AUDIT, OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS } from '../data/original-site-audit.mjs';
import { buildReproductionAudit, summarizeOfficialSyntheticScoreObservations, verifyOfficialSyntheticScoreReadbacks } from '../lib/reproduction-audit.mjs';
import { scoreAnswers } from '../lib/quiz.mjs';

test('homepage distinguishes user-reported reuse permission from independent verification', () => {
  const homepage = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
  assert.match(homepage, /用户报告已获当前公开材料的官方非营利翻译许可/);
  assert.match(homepage, /许可原件未独立核验/);
  assert.match(homepage, /正式译文与官方计分仍待核验/);
  assert.doesNotMatch(homepage, /原题转载许可[^。]*仍待核验/);
});

test('source item counts and independent demo item counts are never conflated', () => {
  const audit = buildReproductionAudit();
  assert.equal(audit.originalEquivalenceVerified, false);
  assert.deepEqual(audit.rows.map(x => [x.sourceObservedQuestionCount, x.independentDemoQuestionCount]), [[87, 8], [37, 6]]);
  assert.ok(audit.rows.every(x => !x.reproductionReady));
  assert.ok(audit.rows.every(x => !x.originalBranchingVerified && !x.originalScoringVerified));
});

test('official synthetic readbacks distinguish two checked pairs from the unchecked historical input', () => {
  const summary = summarizeOfficialSyntheticScoreObservations();
  assert.equal(summary.observedAnonymousSyntheticResults, 3);
  assert.equal(summary.verifiedInputOutputPairs, 2);
  assert.equal(summary.inputUnverifiedResults, 1);
  assert.deepEqual(summary.observedVersionTuples, ['season-2@2026-08 / season-2-score@2 / 2e4ed483b6b79197']);
  assert.equal(summary.officialAlgorithmVerified, false);

  const checked = OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS[0];
  assert.deepEqual(checked.input, { pattern: 'uniform', choice: 'O', questionCount: 37 });
  assert.equal(checked.output.resultType, '원칙·구조·의미');
  assert.deepEqual(checked.output.axes.map(({ leftPercent, rightPercent, intensity }) =>
    [leftPercent, rightPercent, intensity]), [[50, 50, 1], [50, 50, 1], [50, 50, 1]]);
  assert.equal(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS[1].input, null);
  const grouped = OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS[2];
  assert.equal(grouped.resultCreatedAt, '2026-10-31T16:12:32.732Z');
  assert.deepEqual(grouped.input.questionIdsByChoice.O,
    Array.from({ length: 13 }, (_, i) => `rp${String(i + 1).padStart(2, '0')}`));
  assert.deepEqual(grouped.input.questionIdsByChoice.X,
    [...Array.from({ length: 13 }, (_, i) => `sa${String(i + 1).padStart(2, '0')}`),
      ...Array.from({ length: 8 }, (_, i) => `ms${String(i + 1).padStart(2, '0')}`), 'ms10', 'ms11', 'ms13']);
  assert.equal(buildReproductionAudit().originalEquivalenceVerified, false);
});

test('empty official readback evidence must never be reported as all matching', async () => {
  assert.throws(() => summarizeOfficialSyntheticScoreObservations([]), /至少需要一条|不能为空/);
  let called = false;
  await assert.rejects(
    () => verifyOfficialSyntheticScoreReadbacks([], async () => { called = true; throw new Error('must not fetch'); }),
    /至少需要一条|不能为空/,
  );
  assert.equal(called, false, 'empty evidence must be rejected before network access');
});

test('an unverified synthetic input cannot be upgraded to a gold input/output pair by assertion alone', () => {
  const samples = structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS);
  samples[1].inputVerification = 'verified';
  assert.throws(() => summarizeOfficialSyntheticScoreObservations(samples), /完整输入未经逐题验收/);
  samples[1].inputVerification = 'unverified';
  samples[1].input = { pattern: 'uniform', choice: 'X', questionCount: 37 };
  assert.throws(() => summarizeOfficialSyntheticScoreObservations(samples), /未验收的真实输入/);
});

test('official synthetic fixture rejects participant data, invalid percentages and missing version fingerprints', () => {
  const samples = structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS);
  samples[0].nickname = 'example';
  assert.throws(() => summarizeOfficialSyntheticScoreObservations(samples), /含多余字段/);
  delete samples[0].nickname;
  samples[0].output.axes[0].leftPercent = 101;
  assert.throws(() => summarizeOfficialSyntheticScoreObservations(samples), /轴数据/);
  samples[0].output.axes[0].leftPercent = 50;
  samples[0].output.questionSetHash = 'UNKNOWN';
  assert.throws(() => summarizeOfficialSyntheticScoreObservations(samples), /版本/);
});

test('optional official readback uses only GET and never prints or compares private API metadata', async () => {
  const calls = [];
  const fixtures = OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS;
  const fetchMock = async (url, options) => {
    calls.push({ url, method: options.method });
    const current = fixtures.find(row => url.endsWith('/' + row.publicResultId));
    return { ok: true, json: async () => ({
      ...structuredClone(current.output), nickname: 'DO_NOT_COPY',
      referralCode: 'DO_NOT_COPY', answers: { fake: 'DO_NOT_COPY' },
    }) };
  };
  const result = await verifyOfficialSyntheticScoreReadbacks(fixtures, fetchMock);
  assert.equal(result.allMatch, true);
  assert.equal(result.checked.length, 3);
  assert.deepEqual(calls.map(x => x.method), ['GET', 'GET', 'GET']);
  assert.ok(calls.every(x => x.url.startsWith('https://thecommunity.co.kr/api/v1/results/')));
  assert.doesNotMatch(JSON.stringify(result), /DO_NOT_COPY|referralCode|answers|nickname/);
});

test('grouped synthetic inputs must cover every S2 source ID and follow the recorded source groups', () => {
  const samples = structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS);
  samples[2].input.questionIdsByChoice.O.pop();
  assert.throws(() => summarizeOfficialSyntheticScoreObservations(samples), /完整输入未经逐题验收/);
  const valid = structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS);
  valid[2].input.questionIdsByChoice.X.push(valid[2].input.questionIdsByChoice.O.pop());
  assert.throws(() => summarizeOfficialSyntheticScoreObservations(valid), /完整输入未经逐题验收/);
});

test('official readback compares named axes and fields, ignoring harmless API ordering', async () => {
  const fetchMock = async () => ({ ok: true, json: async () => {
    const original = structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS[0].output);
    return {
      axes: [...original.axes].reverse().map(axis => ({
        intensity: axis.intensity, dominant: axis.dominant,
        rightPercent: axis.rightPercent, leftPercent: axis.leftPercent, id: axis.id,
      })),
      resultType: original.resultType,
      scoringVersion: original.scoringVersion,
      questionSetHash: original.questionSetHash,
      questionnaireVersion: original.questionnaireVersion,
      season: original.season,
    };
  } });
  const result = await verifyOfficialSyntheticScoreReadbacks(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS, fetchMock);
  assert.equal(result.allMatch, true, 'JSON property order and axes array order are not score changes');
  assert.deepEqual(result.checked.map(row => row.matchesRecordedReadback), [true, true, true]);
});

test('official readback rejects an axis drift even when all other axes agree', async () => {
  const fetchMock = async () => ({ ok: true, json: async () => {
    const original = structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS[0].output);
    original.axes[0].leftPercent = 49;
    original.axes[0].rightPercent = 51;
    return original;
  } });
  const result = await verifyOfficialSyntheticScoreReadbacks(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS, fetchMock);
  assert.equal(result.allMatch, false);
});

test('official readback rejects duplicate or missing axis identities', async () => {
  const originals = structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS[0].output);
  for (const axes of [
    [originals.axes[0], originals.axes[0], originals.axes[2]],
    originals.axes.slice(0, 2),
  ]) {
    const fetchMock = async () => ({ ok: true, json: async () => ({ ...originals, axes }) });
    const result = await verifyOfficialSyntheticScoreReadbacks(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS, fetchMock);
    assert.equal(result.allMatch, false);
  }
});

test('optional official readback detects scoring-version drift without updating stored evidence', async () => {
  const fetchMock = async () => ({ ok: true, json: async () => ({
    ...structuredClone(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS[0].output),
    scoringVersion: 'season-2-score@3',
  }) });
  const result = await verifyOfficialSyntheticScoreReadbacks(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS, fetchMock);
  assert.equal(result.allMatch, false);
  assert.deepEqual(result.checked.map(row => row.matchesRecordedReadback), [false, false, false]);
  assert.equal(OFFICIAL_SYNTHETIC_SCORE_OBSERVATIONS[0].output.scoringVersion, 'season-2-score@2');
});

test('a coincidentally equal question count cannot validate an official reproduction', () => {
  const inflated = structuredClone(SEASONS);
  inflated[1].questions = Array.from({ length: 87 }, (_, i) => ({
    ...inflated[1].questions[i % inflated[1].questions.length],
    id: 'demo-' + i,
  }));
  const audit = buildReproductionAudit(inflated, ORIGINAL_SITE_AUDIT);
  assert.equal(audit.rows[0].sourceObservedQuestionCount, 87);
  assert.equal(audit.rows[0].independentDemoQuestionCount, 87);
  assert.equal(audit.rows[0].reproductionReady, false);
});

test('source status flags cannot promote a full-sized independent demo into an official reproduction', () => {
  const demos = structuredClone(SEASONS);
  const evidence = structuredClone(ORIGINAL_SITE_AUDIT);
  for (const id of [1, 2]) {
    const original = demos[id].questions;
    demos[id].questions = Array.from({ length: evidence[id].observedQuestionCount }, (_, i) => ({
      ...original[i % original.length], id: `demo-${i}`,
    }));
    Object.assign(evidence[id], {
      questionTextReusePermission: 'verified', questionIdentityCoverage: 'verified_complete',
      answerBranchingCoverage: 'verified_complete', scoringAgreement: 'validated_against_original',
    });
  }
  const audit = buildReproductionAudit(demos, evidence);
  assert.equal(audit.originalEquivalenceVerified, false);
  assert.ok(audit.rows.every(row => !row.reproductionReady));
});

test('exhaustively exercise every independent-demo answer vector, without implying official scoring correctness', () => {
  for (const season of Object.values(SEASONS)) {
    const values = season.questions.map(q => q.options.map(o => o.value));
    const combinations = values.reduce((total, v) => total * v.length, 1);
    let checked = 0;
    for (let mask = 0; mask < combinations; mask++) {
      let current = mask;
      const answers = {};
      for (let i = 0; i < values.length; i++) {
        const choices = values[i];
        answers[season.questions[i].id] = choices[current % choices.length];
        current = Math.floor(current / choices.length);
      }
      const result = scoreAnswers(season, answers);
      assert.equal(result.origin, 'independent_demo');
      assert.ok(result.dimensions.every(d => Number.isInteger(d.score) && d.score >= -100 && d.score <= 100));
      checked++;
    }
    assert.equal(checked, season.id === 1 ? 65_536 : 64);
  }
});
