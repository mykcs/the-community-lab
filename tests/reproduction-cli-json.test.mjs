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
  assert.equal(report.officialScoreEvidence.observedAnonymousSyntheticResults, 4);
  assert.equal(report.officialScoreEvidence.verifiedInputOutputPairs, 3);
  assert.equal(report.officialScoreOutputCoverage.officialAlgorithmVerified, false);
  assert.equal(report.officialScoreInputCoverage.questionCount, 37);
  assert.equal(report.localOfficialScoreComparison.availableVerifiedPairs, 3);
  assert.equal(report.localOfficialScoreComparison.comparedPairs, 0);
  assert.equal(report.localOfficialScoreComparison.allRecordedPairsMatch, false);
  assert.equal(report.localOfficialScoreComparison.status, 'BLOCKED_NO_LOCAL_OFFICIAL_SCORER');
  assert.equal(report.officialResultDisplayEvidence.independentlyReviewedChineseResultExplanations, 0);
  assert.equal(report.liveReadbackStatus, 'NOT_REQUESTED');
  assert.ok(!Object.hasOwn(report, 'liveReadbackReport'));
  assert.doesNotMatch(result.stdout, /(^最终愿望|^官方 S2 匿名合成结果)/m);
  // No full answer vectors or personal API payloads belong in this status report.
  assert.doesNotMatch(result.stdout, /"questionIdsByChoice"|"nickname"|"referralCode"|"selections"/);
});

test('reproduction audit retains its human-readable report without --json', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /最终愿望/);
  assert.match(result.stdout, /官方 S2 匿名合成结果读回 4 份；完整输入→输出样本 3 份/);
  assert.match(result.stdout, /实际比较 0 份/);
  assert.throws(() => JSON.parse(result.stdout), SyntaxError);
});
