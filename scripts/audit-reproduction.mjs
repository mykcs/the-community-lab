import { buildReproductionAudit, summarizeOfficialSyntheticScoreObservations, summarizeVerifiedOfficialScoreOutputCoverage, verifyOfficialSyntheticScoreReadbacks } from '../lib/reproduction-audit.mjs';
import { compareCandidateAgainstRecordedOfficialPairs, summarizeVerifiedOfficialScoreInputCoverage } from '../lib/official-score-parity.mjs';

console.log('最终愿望：不懂韩文也能忠实理解同一套官方题目，且同季、同版本、同一份实际答卷得到与官网逐字段相同的结果。');
const result = buildReproductionAudit();
for (const row of result.rows) {
  console.log('S' + row.season + ': 原站观察 ' + row.sourceObservedQuestionCount + ' 题；本站原创演示 ' + row.independentDemoQuestionCount + ' 题；官方复刻资格 ' + (row.reproductionReady ? '已验证' : '未验证'));
  console.log('  当前客户端源题标识 ' + row.observedSourceIdentityCount + ' 条；获许可且独立复核的原题 ' + row.licensedReviewedOfficialQuestionCount + ' 道（不同验收项，不折算复刻进度）');
}
console.log('原站同题、同路径、同结果：', result.originalEquivalenceVerified ? '全部已验证' : '尚无充分证据，不能宣称复刻完成');
const scoreEvidence = summarizeOfficialSyntheticScoreObservations();
console.log('官方 S2 匿名合成结果读回 ' + scoreEvidence.observedAnonymousSyntheticResults + ' 份；完整输入→输出样本 ' + scoreEvidence.verifiedInputOutputPairs + ' 份；输入未验收 ' + scoreEvidence.inputUnverifiedResults + ' 份。官方算法仍为 UNKNOWN。');
console.log('观测到的题库／评分版本／题集指纹：' + scoreEvidence.observedVersionTuples.join('；'));
const coverage = summarizeVerifiedOfficialScoreOutputCoverage();
console.log('官方结果样本覆盖：' + coverage.verifiedPairs + ' 份完整输入只产生 ' +
  coverage.distinctRecordedOutputSignatures + ' 种不同三轴显示结果；3 个轴中 ' +
  coverage.axesWithAnyNonTie + ' 个曾出现非 50/50，' +
  coverage.axesWithBothNonTieSides + ' 个左右两侧都出现过非平局，' +
  coverage.axesWithIntensityTwo + ' 个曾出现强度 2。这是证据覆盖统计，不是算法验收。');
const inputCoverage = summarizeVerifiedOfficialScoreInputCoverage();
console.log('官方完整输入的区分力：' + inputCoverage.verifiedPairs + ' 份金标准中有 ' +
  inputCoverage.uniqueInputVectors + ' 种不同原始答案向量；' +
  inputCoverage.questionsObservedWithBothValues + '/' + inputCoverage.questionCount +
  ' 道题曾在不同已验收样本中同时出现 O 与 X；' +
  inputCoverage.questionsObservedWithOnlyOneValue + ' 道仅观察到单一选择。');
console.log('不同输入向量两两对比（重复答卷不重复计数）：' + inputCoverage.comparedInputPairs + ' 对；' +
  inputCoverage.singleQuestionContrastPairs + ' 对只差 1 题；最少/最多相差 ' +
  (inputCoverage.minPairwiseHammingDistance ?? 'UNKNOWN') + '/' +
  (inputCoverage.maxPairwiseHammingDistance ?? 'UNKNOWN') +
  ' 题。多题一起变化不能推断每题权重或评分公式。');
const parity = await compareCandidateAgainstRecordedOfficialPairs();
console.log('严格逐字段评分差分：已锁定 ' + parity.availableVerifiedPairs + ' 份完整合成输入和官方输出；本地官方计分器仍缺失，实际比较 ' + parity.comparedPairs + ' 份，状态 ' + parity.status + '。');
if (process.argv.includes('--verify-live-readbacks')) {
  try {
    const fresh = await verifyOfficialSyntheticScoreReadbacks();
    for (const row of fresh.checked) {
      console.log('只读官方结果 ' + row.publicResultId + '：' + (row.matchesRecordedReadback ? '与既有记录吻合' : '发现差异，需人工复查'));
    }
    if (!fresh.allMatch) process.exitCode = 1;
  } catch (error) {
    console.error('官方结果只读回查未完成：' + error.message + '。既有证据未改动。');
    process.exitCode = 1;
  }
}
if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
