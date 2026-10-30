import { buildReproductionAudit, summarizeOfficialSyntheticScoreObservations, verifyOfficialSyntheticScoreReadbacks } from '../lib/reproduction-audit.mjs';

const result = buildReproductionAudit();
for (const row of result.rows) {
  console.log('S' + row.season + ': 原站观察 ' + row.sourceObservedQuestionCount + ' 题；本站原创演示 ' + row.independentDemoQuestionCount + ' 题；官方复刻资格 ' + (row.reproductionReady ? '已验证' : '未验证'));
  console.log('  当前客户端源题标识 ' + row.observedSourceIdentityCount + ' 条；获许可且独立复核的原题 ' + row.licensedReviewedOfficialQuestionCount + ' 道（不同验收项，不折算复刻进度）');
}
console.log('原站同题、同路径、同结果：', result.originalEquivalenceVerified ? '全部已验证' : '尚无充分证据，不能宣称复刻完成');
const scoreEvidence = summarizeOfficialSyntheticScoreObservations();
console.log('官方 S2 匿名合成结果读回 ' + scoreEvidence.observedAnonymousSyntheticResults + ' 份；完整输入→输出样本 ' + scoreEvidence.verifiedInputOutputPairs + ' 份；输入未验收 ' + scoreEvidence.inputUnverifiedResults + ' 份。官方算法仍为 UNKNOWN。');
console.log('观测到的题库／评分版本／题集指纹：' + scoreEvidence.observedVersionTuples.join('；'));
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
