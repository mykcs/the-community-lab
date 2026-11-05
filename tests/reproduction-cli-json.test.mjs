import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/audit-reproduction.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [script, ...args], {
  encoding: 'utf8', timeout: 30_000,
});

test('reproduction audit --json emits one parseable document with honest scoring gates', () => {
  // Deliberately offline: must not contact an external survey or create results.
  const result = run('--json');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /^\{/);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schemaVersion, 'reproduction-audit-report@1');
  assert.equal(report.reproductionAudit.originalEquivalenceVerified, false);
  // Separately count published AI-draft options, NOT official reviewed items
  // or the 8+6 original demonstrations. This is the canonical pilot pack.
  const draft = report.publicUnreviewedDraftCoverage;
  assert.equal(draft.status, 'SOURCE_QUESTION_PILOT_UNREVIEWED_NOT_OFFICIAL');
  assert.equal(draft.rightsEvidence, 'USER_REPORTED_NOT_INDEPENDENTLY_VERIFIED');
  assert.equal(draft.bilingualReviewStatus, 'NOT_INDEPENDENTLY_REVIEWED');
  assert.equal(draft.scoringVersion, 'UNKNOWN');
  assert.deepEqual(draft.seasons, [
    { season: 1, publishedUnreviewedDraftQuestions: 87, publishedUnreviewedDraftOptions: 476 },
    { season: 2, publishedUnreviewedDraftQuestions: 37, publishedUnreviewedDraftOptions: 74 },
  ]);
  assert.deepEqual(
    report.reproductionAudit.rows.map(row => row.independentDemoQuestionCount),
    [8, 6],
  );
  assert.deepEqual(
    report.reproductionAudit.rows.map(row => row.licensedReviewedOfficialQuestionCount),
    [0, 0],
  );
  assert.equal(report.officialScoreEvidence.observedAnonymousSyntheticResults, 10);
  assert.equal(report.officialScoreEvidence.verifiedInputOutputPairs, 9);
  assert.equal(report.officialScoreInputCoverage.uniqueInputVectors, 4);
  assert.equal(report.officialScoreInputCoverage.contradictoryInputVectors, 1);
  assert.equal(report.officialScoreOutputCoverage.officialAlgorithmVerified, false);
  assert.equal(report.officialScoreInputCoverage.questionCount, 37);
  assert.equal(report.localOfficialScoreComparison.availableVerifiedPairs, 0);
  assert.equal(report.localOfficialScoreComparison.observedVerifiedPairs, 9);
  assert.equal(report.localOfficialScoreComparison.comparedPairs, 0);
  assert.equal(report.localOfficialScoreComparison.allRecordedPairsMatch, false);
  assert.equal(report.localOfficialScoreComparison.status, 'BLOCKED_CONTRADICTORY_OFFICIAL_READBACKS');
  assert.equal(report.officialResultDisplayEvidence.independentlyReviewedChineseResultExplanations, 0);
  assert.equal(report.liveReadbackStatus, 'NOT_REQUESTED');
  assert.equal(report.liveClientSnapshotStatus, 'NOT_REQUESTED');
  assert.ok(!Object.hasOwn(report, 'liveClientSnapshot'));
  assert.ok(!Object.hasOwn(report, 'liveReadbackReport'));
  assert.doesNotMatch(result.stdout, /(^最终愿望|^官方 S2 匿名合成结果)/m);
  // No full answer vectors or personal API payloads belong in this status report.
  assert.doesNotMatch(result.stdout, /"questionIdsByChoice"|"nickname"|"referralCode"|"selections"/);
});

test('reproduction audit retains its human-readable report without --json', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /最终愿望/);
  assert.match(result.stdout, /官方 S2 匿名合成结果读回 10 份；完整输入→输出样本 9 份/);
  assert.match(result.stdout, /实际比较 0 份/);
  assert.match(result.stdout, /S1 87 题／476 选项；S2 37 题／74 选项/);
  assert.match(result.stdout, /许可原件未独立核验、真人双语审校未完成/);
  assert.throws(() => JSON.parse(result.stdout), SyntaxError);
});
