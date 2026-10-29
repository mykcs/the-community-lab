import { buildReproductionAudit } from '../lib/reproduction-audit.mjs';

const result = buildReproductionAudit();
for (const row of result.rows) {
  console.log('S' + row.season + ': 原站观察 ' + row.sourceObservedQuestionCount + ' 题；本站原创演示 ' + row.independentDemoQuestionCount + ' 题；官方复刻资格 ' + (row.reproductionReady ? '已验证' : '未验证'));
}
console.log('原站同题、同路径、同结果：', result.originalEquivalenceVerified ? '全部已验证' : '尚无充分证据，不能宣称复刻完成');
if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
