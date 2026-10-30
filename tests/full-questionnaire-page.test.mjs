import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../src/pages/questionnaire/index.astro', import.meta.url), 'utf8');
const app = readFileSync(new URL('../full-questionnaire-app.mjs', import.meta.url), 'utf8');
const loader = readFileSync(new URL('../scripts/load-full-questionnaire.mjs', import.meta.url), 'utf8');

test('two source seasons, provenance and unreviewed pilot disclosures appear in the page', () => {
  assert.match(page, /data-start-season="1"/);
  assert.match(page, /data-start-season="2"/);
  assert.match(page, /第一季 87 题/);
  assert.match(page, /第二季 37 题/);
  assert.match(page, /AI 初译/);
  assert.match(page, /未经人工复核/);
  assert.match(page, /非官方正式测试|不是官方正式测试/);
  assert.match(page, /许可原件/);
  assert.match(page, /不上传服务器/);
  assert.match(page, /官方计分/);
  assert.match(page, /<script id="full-questionnaire-data" type="application\/json" set:html={embedded}>/);
  assert.match(page, /<script>import '\.\.\/\.\.\/\.\.\/full-questionnaire-app\.mjs';<\/script>/);
});

test('in-memory sessions support revisiting, changes, season isolation and local download with no external result submission', () => {
  assert.match(app, /const saved = new Map\(\)/);
  assert.match(app, /answers: Object\.create\(null\)/);
  assert.match(app, /active\.answers\[q\.id\] = choice\.value/);
  assert.match(app, /if \(active\.index > 0\)/);
  assert.match(app, /summarizeUnscoredAnswers/);
  assert.match(app, /new Blob\(/);
  assert.match(app, /URL\.createObjectURL\(/);
  assert.doesNotMatch(app, /\b(fetch|XMLHttpRequest|localStorage|sessionStorage|sendBeacon)\s*\(/);
  assert.doesNotMatch(app, /\.results\b|api\/v1\/results/);
});

test('private opt-in backup/restoration is local-only, version-checked and available before finishing', () => {
  assert.match(page, /id="full-save"/);
  assert.match(page, /id="full-import"/);
  assert.match(page, /id="full-import-file" type="file"/);
  assert.match(page, /默认只存在于当前页面内存/);
  assert.match(page, /不自动持久保存/);
  assert.match(page, /私人观点/);
  assert.match(app, /createPrivateProgressReceipt\(pack, active\.season, active\.answers, active\.index\)/);
  assert.match(app, /restorePrivateProgressReceipt\(pack, record\)/);
  assert.match(app, /file\.size > 128 \* 1024/);
  assert.match(app, /JSON\.parse\(await file\.text\(\)\)/);
  assert.match(app, /saved\.set\(session\.season/);
  assert.match(page, /如导入会删除或覆盖本页已答选择，系统会先要求确认/);
  const validatedAt = app.indexOf('restorePrivateProgressReceipt(pack, record)');
  const confirmedAt = app.indexOf('window.confirm(');
  const overwrittenAt = app.indexOf('saved.set(session.season');
  assert.ok(validatedAt >= 0 && validatedAt < confirmedAt && confirmedAt < overwrittenAt);
  assert.match(app, /wouldDiscardLocalAnswers\(previous\.answers, session\.answers\)/);
  assert.match(app, /if \(!confirmed\) \{[\s\S]*?return;[\s\S]*?\}\s*\}\s*saved\.set\(/);
  assert.doesNotMatch(app, /\b(fetch|XMLHttpRequest|localStorage|sessionStorage|sendBeacon)\s*\(/);
});

test('build uses the already-published single draft source rather than duplicating source questions', () => {
  assert.match(loader, /docs\/translation-review\/index\.html/);
  assert.match(loader, /data\/original-question-index\.json/);
  assert.doesNotMatch(loader, /https?:\/\//);
});

test('restart of answered season asks before clearing private in-memory answers', () => {
  const handler = app.match(/\$\('full-restart'\)\.addEventListener\('click', \(\) => \{([\s\S]*?)\n\}\);/)?.[1];
  assert.ok(handler, 'restart must use an explicit handler');
  const countAt = handler.indexOf('Object.keys(active.answers).length');
  const confirmAt = handler.indexOf('window.confirm(');
  const restartAt = handler.indexOf('begin(active.season, true)');
  assert.ok(countAt >= 0 && countAt < confirmAt && confirmAt < restartAt,
    'count and ask before replacing the in-memory season');
  assert.match(handler, /if \(answered > 0 && !window.confirm\([\s\S]*?\)\) return;/);
  assert.match(page, /重新开始本季会清空本页答案，须先确认/);
});
