import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the only canonical Wish explicitly prioritizes faithful Chinese and identical official outcomes', () => {
  const wish = read('WISH.md');
  const router = read('docs/wish/README.md');
  const agents = read('AGENTS.md');
  assert.match(wish, /北极星 · 做出官网测试真正可用的中文版/);
  assert.match(wish, /同一季、同一版、同一套官方题目和选项/);
  assert.match(wish, /完全相同的分数、各轴方向／百分比、结果类型与解释/);
  assert.match(wish, /当前的 124 题 AI 初译试填和 8＋6 题原创演示只是通往目标的阶段性工具/);
  assert.match(wish, /第二季忠实中文版/);
  assert.match(wish, /第一季同样的等价验收/);
  assert.match(router, /\[WISH\.md\]\(\.\.\/\.\.\/WISH\.md\)/);
  assert.match(agents, /同答卷同结果硬门槛/);
  assert.match(agents, /不得把它们的完成度替代官方等价目标/);
});

test('the proof contract cannot replace a verified input vector with a result screenshot', () => {
  const matrix = read('docs/VERIFICATION-MATRIX.md');
  const translation = read('docs/TRANSLATION-STANDARD.md');
  assert.match(matrix, /完整.*sourceQuestionId.*原始选项值/);
  assert.match(matrix, /主观打算全选 X、结果截图、仅有结果 ID/);
  assert.match(matrix, /独立计算/);
  assert.match(matrix, /有限几个对照样例全部相同，也不能证明所有选择结果相同/);
  assert.match(matrix, /三份.*输入已验收/);
  assert.match(translation, /翻译仅是展示层/);
  assert.match(translation, /理解检验/);
});

test('the public front door puts current 37-question source pilot before the unrelated six-question demo', () => {
  const readme = read('README.md');
  const home = read('src/pages/index.astro');
  assert.match(readme, /同原题、同选项、同答案、同官网结果/);
  assert.match(readme, /官方计分公式仍未知/);
  assert.match(home, /我们的目标不是另写一套测试/);
  const sourceAction = home.indexOf('试填第二季 37 题 · 非官方 AI 初译');
  const demoAction = home.indexOf('另看 6 道本站原创演示');
  assert.ok(sourceAction >= 0 && demoAction > sourceAction, '原题试填必须排在原创演示主按钮前');
  assert.match(home, /真人韩中复核目前为 0\/124/);
  assert.match(home, /不能获得官方分数/);
  assert.match(read('src/pages/questionnaire/index.astro'), /这里不显示官方分数或嘉宾匹配/);
});
