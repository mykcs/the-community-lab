import { buildReproductionAudit, summarizeOfficialSyntheticScoreObservations, summarizeVerifiedOfficialScoreOutputCoverage, verifyOfficialSyntheticScoreReadbacks } from '../lib/reproduction-audit.mjs';
import { compareCandidateAgainstRecordedOfficialPairs, summarizeVerifiedOfficialScoreInputCoverage } from '../lib/official-score-parity.mjs';
import { summarizeOfficialResultDisplayDigestCoverage } from '../lib/official-result-display-audit.mjs';
import { loadFullQuestionnaire } from './load-full-questionnaire.mjs';
import { PILOT_STATUS } from '../lib/full-questionnaire.mjs';
import SOURCE_INDEX from '../data/original-question-index.json' with { type: 'json' };

const jsonOutput = process.argv.includes('--json');
// Human-readable diagnostics belong to normal stdout; --json is a strict,
// machine-readable audit contract (one JSON document, no prose prefix).
const emitHuman = (...parts) => { if (!jsonOutput) console.log(...parts); };
let liveReadbackStatus = 'NOT_REQUESTED';
let liveReadbackReport = null;

emitHuman('最终愿望：不懂韩文也能忠实理解同一套官方题目，且同季、同版本、同一份实际答卷得到与官网逐字段相同的结果。');
const result = buildReproductionAudit();
for (const row of result.rows) {
  emitHuman('S' + row.season + ': 原站观察 ' + row.sourceObservedQuestionCount + ' 题；本站原创演示 ' + row.independentDemoQuestionCount + ' 题；官方复刻资格 ' + (row.reproductionReady ? '已验证' : '未验证'));
  emitHuman('  当前客户端源题标识 ' + row.observedSourceIdentityCount + ' 条；获许可且独立复核的原题 ' + row.licensedReviewedOfficialQuestionCount + ' 道（不同验收项，不折算复刻进度）');
}
// The 124 published AI drafts are neither original-client observations nor
// the 8+6 independently authored demos. Count them separately from the SAME
// build-time pack used by /questionnaire/, with its rights/review gates intact.
// No question text or individual answers are exported by this audit.
const pilot = loadFullQuestionnaire();
if (pilot.status !== PILOT_STATUS ||
    pilot.rightsEvidence !== 'USER_REPORTED_NOT_INDEPENDENTLY_VERIFIED' ||
    pilot.scoringVersion !== 'UNKNOWN') {
  throw new Error('非官方公开试填状态异常；禁止报告为已验证原版');
}
const publicUnreviewedDraftCoverage = {
  status: pilot.status,
  rightsEvidence: pilot.rightsEvidence,
  bilingualReviewStatus: 'NOT_INDEPENDENTLY_REVIEWED',
  scoringVersion: pilot.scoringVersion,
  seasons: result.rows.map(row => {
    const questions = pilot.seasons[row.season];
    if (!Array.isArray(questions) ||
        questions.length !== row.observedSourceIdentityCount ||
        pilot.sourceSha256 !== SOURCE_INDEX.sourceAssetSha256) {
      throw new Error('公开试填与审计源题身份／版本不一致');
    }
    return {
      season: row.season,
      publishedUnreviewedDraftQuestions: questions.length,
      publishedUnreviewedDraftOptions: questions.reduce((n, q) => n + q.options.length, 0),
    };
  }),
};
const draftQuestionCount = publicUnreviewedDraftCoverage.seasons.reduce(
  (n, row) => n + row.publishedUnreviewedDraftQuestions, 0);
const draftOptionCount = publicUnreviewedDraftCoverage.seasons.reduce(
  (n, row) => n + row.publishedUnreviewedDraftOptions, 0);
emitHuman('本站公开 AI 初译试填：' +
  publicUnreviewedDraftCoverage.seasons.map(row =>
    'S' + row.season + ' ' + row.publishedUnreviewedDraftQuestions +
    ' 题／' + row.publishedUnreviewedDraftOptions + ' 选项').join('；') +
  '；合计 ' + draftQuestionCount + ' 题／' + draftOptionCount +
  ' 选项。许可原件未独立核验、真人双语审校未完成，不计入官方等价验收。');
emitHuman('原站同题、同路径、同结果：', result.originalEquivalenceVerified ? '全部已验证' : '尚无充分证据，不能宣称复刻完成');
const scoreEvidence = summarizeOfficialSyntheticScoreObservations();
emitHuman('官方 S2 匿名合成结果读回 ' + scoreEvidence.observedAnonymousSyntheticResults + ' 份；完整输入→输出样本 ' + scoreEvidence.verifiedInputOutputPairs + ' 份；输入未验收 ' + scoreEvidence.inputUnverifiedResults + ' 份。官方算法仍为 UNKNOWN。');
emitHuman('观测到的题库／评分版本／题集指纹：' + scoreEvidence.observedVersionTuples.join('；'));
const coverage = summarizeVerifiedOfficialScoreOutputCoverage();
emitHuman('官方结果样本覆盖：' + coverage.verifiedPairs + ' 份完整输入只产生 ' +
  coverage.distinctRecordedOutputSignatures + ' 种不同三轴显示结果；3 个轴中 ' +
  coverage.axesWithAnyNonTie + ' 个曾出现非 50/50，' +
  coverage.axesWithBothNonTieSides + ' 个左右两侧都出现过非平局，' +
  coverage.axesWithIntensityTwo + ' 个曾出现强度 2。这是证据覆盖统计，不是算法验收。');
const inputCoverage = summarizeVerifiedOfficialScoreInputCoverage();
emitHuman('官方完整输入的区分力：' + inputCoverage.verifiedPairs + ' 份金标准中有 ' +
  inputCoverage.uniqueInputVectors + ' 种不同原始答案向量；' +
  inputCoverage.questionsObservedWithBothValues + '/' + inputCoverage.questionCount +
  ' 道题曾在不同已验收样本中同时出现 O 与 X；' +
  inputCoverage.questionsObservedWithOnlyOneValue + ' 道仅观察到单一选择。');
emitHuman('不同输入向量两两对比（重复答卷不重复计数）：' + inputCoverage.comparedInputPairs + ' 对；' +
  inputCoverage.singleQuestionContrastPairs + ' 对只差 1 题；最少/最多相差 ' +
  (inputCoverage.minPairwiseHammingDistance ?? 'UNKNOWN') + '/' +
  (inputCoverage.maxPairwiseHammingDistance ?? 'UNKNOWN') +
  ' 题。多题一起变化不能推断每题权重或评分公式。');
emitHuman('单一客户端题组内的输入对照：' + inputCoverage.groupLocalContrastPairs +
  ' 对。' + inputCoverage.groupLocalContrasts.map(row =>
    row.sourceGroup + '组内差 ' + row.differingQuestions + ' 题、官方显示变化轴 ' +
    (row.changedScoreAxisIds.join('、') || '无')).join('；') +
  '。这是已记录样本的组级观察，不证明单题权重或其他输入下的轴独立性。');
const parity = await compareCandidateAgainstRecordedOfficialPairs();
emitHuman('严格逐字段数值评分差分：已锁定 ' + parity.availableVerifiedPairs + ' 份完整合成输入和官方输出；本地官方计分器仍缺失，实际比较 ' + parity.comparedPairs + ' 份，状态 ' + parity.status + '。');
const displayCoverage = summarizeOfficialResultDisplayDigestCoverage();
emitHuman('官方结果文字额外核查：既有 ' + displayCoverage.observedResultReadbacksWithDisplayDigests +
  ' 份匿名合成读回已记录韩文标题/说明 SHA-256（' +
  displayCoverage.distinctResultDisplayTextSignatures + ' 种不同文本指纹）；中文结果解释独立人工审核 ' +
  displayCoverage.independentlyReviewedChineseResultExplanations + ' 份。指纹只检测原文变动，不代表原文可转载或中文解释等价。');
if (process.argv.includes('--verify-live-readbacks')) {
  try {
    const fresh = await verifyOfficialSyntheticScoreReadbacks(undefined, undefined, { verifyDisplayText: true });
    liveReadbackStatus = fresh.allMatch ? 'MATCHED_RECORDED_READBACKS' : 'MISMATCHED_RECORDED_READBACKS';
    liveReadbackReport = fresh;
    for (const row of fresh.checked) {
      emitHuman('只读官方结果 ' + row.publicResultId + '：' + (row.matchesRecordedReadback
        ? '数值、韩文标题/说明指纹及轴标签均吻合'
        : '数值或公开显示文字发生差异，需人工复查'));
    }
    if (!fresh.allMatch) process.exitCode = 1;
  } catch (error) {
    liveReadbackStatus = 'FAILED';
    console.error('官方结果只读回查未完成：' + error.message + '。既有证据未改动。');
    process.exitCode = 1;
  }
}
if (jsonOutput) {
  // Never print official answer vectors, arbitrary API payloads or private metadata.
  // These summaries are derived solely from the fixed, previously approved
  // anonymous synthetic fixtures, and explicitly keep the scorer blocked.
  console.log(JSON.stringify({
    schemaVersion: 'reproduction-audit-report@1',
    reproductionAudit: result,
    publicUnreviewedDraftCoverage,
    officialScoreEvidence: scoreEvidence,
    officialScoreOutputCoverage: coverage,
    officialScoreInputCoverage: inputCoverage,
    localOfficialScoreComparison: parity,
    officialResultDisplayEvidence: displayCoverage,
    liveReadbackStatus,
    ...(liveReadbackReport ? { liveReadbackReport } : {}),
  }, null, 2));
}
