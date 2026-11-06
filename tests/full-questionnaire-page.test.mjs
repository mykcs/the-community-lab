import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('backup import confirms changes to historical translation evidence even when choices match', () => {
  const app = readFileSync(new URL('../full-questionnaire-app.mjs', import.meta.url), 'utf8');
  assert.match(app, /countReplacedLocalAnswerProvenance\(previous, session\)/);
  assert.match(app, /discardsLocal \|\| changed \|\| overwrittenProvenance/);
  assert.match(app, /旧备份可能使指纹变成历史未知/);
});

const page = readFileSync(new URL('../src/pages/questionnaire/index.astro', import.meta.url), 'utf8');
const app = readFileSync(new URL('../full-questionnaire-app.mjs', import.meta.url), 'utf8');
const loader = readFileSync(new URL('../scripts/load-full-questionnaire.mjs', import.meta.url), 'utf8');

test('quiz announces the current question and answered count to assistive technology', () => {
  assert.match(page, /id="full-announcement"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(page, /\.full-sr-only\{position:absolute;width:1px;height:1px/);
  assert.match(app, /function updateProgress\(questions\)[\s\S]*?full-announcement'\)\.textContent = `第 \$\{active\.index \+ 1\} \/ \$\{questions\.length\} 题；已答 \$\{answered\} \/ \$\{questions\.length\} 题。`;/);
  assert.equal((app.match(/updateProgress\(questions\);/g) || []).length, 2,
    'announce progress after rendering a question and after changing an answer');
});

test('two source seasons, provenance and unreviewed pilot disclosures appear in the page', () => {
  assert.match(page, /data-start-season="1"/);
  assert.match(page, /data-start-season="2"/);
  assert.match(page, /第一季 87 题/);
  assert.match(page, /第二季 37 题/);
  assert.match(page, /公开客户端已观测的 124 道题/);
  assert.doesNotMatch(page, /独立非官方完整原题试填/);
  assert.match(page, /AI 初译/);
  assert.match(page, /未经人工复核/);
  assert.match(page, /独立韩中复核尚未完成/);
  assert.doesNotMatch(page, /真人审核暂缓/);
  assert.match(page, /非官方正式测试|不是官方正式测试/);
  assert.match(page, /许可原件/);
  assert.match(page, /不上传服务器/);
  assert.match(page, /官方计分/);
  assert.match(page, /id="full-source-fingerprint"/);
  assert.match(page, /这不是官方题库或计分版本号/);
  assert.match(app, /full-source-fingerprint'\)\.textContent = `\$\{pack\.sourceSha256\} · \$\{pack\.observedAt\}`/);
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

test('completed-answer review can jump to any valid position and recalculate without changing fresh paths', () => {
  for (const id of ['full-review-tools', 'full-jump-position', 'full-jump', 'full-jump-status', 'full-finish-review']) {
    assert.match(page, new RegExp(`id="${id}"`));
  }
  assert.match(page, /只在修改已完成答卷或核对更新译文时开放/);
  assert.match(app, /reviewMode: false/);
  assert.match(app, /reviewMode: session\.complete/);
  assert.match(app, /active\.reviewMode = true/);
  assert.match(app, /\$\('full-review-tools'\)\.hidden = !active\.reviewMode/);
  assert.match(app, /if \(!active\?\.reviewMode\) return/);
  assert.match(app, /Number\.isSafeInteger\(position\)/);
  assert.match(app, /finish\(\); \/\/ Recompute from current selections/);
  assert.doesNotMatch(app, /\b(fetch|XMLHttpRequest|localStorage|sessionStorage|sendBeacon)\s*\(/);
});

test('private opt-in backup/restoration is local-only, version-checked and available before finishing', () => {
  assert.match(page, /id="full-save"/);
  assert.match(page, /id="full-import"/);
  assert.match(page, /id="full-import-file" type="file"/);
  assert.match(page, /默认只存在于当前页面内存/);
  assert.match(page, /不自动持久保存/);
  assert.match(page, /私人观点/);
  assert.match(app, /createPrivateProgressReceipt\(pack, active\.season, active\.answers, active\.index, active\.answerVersions, active\.answerFingerprints\)/);
  assert.match(app, /restorePrivateProgressReceipt\(pack, record\)/);
  assert.match(app, /file\.size > 128 \* 1024/);
  assert.match(app, /const content = await file\.text\(\)/);
  assert.match(app, /if \(requestId !== latestImportRequest\) return/);
  assert.match(app, /const record = JSON\.parse\(content\)/);
  assert.match(app, /saved\.set\(session\.season/);
  assert.match(page, /如导入会删除或覆盖本页已答选择，系统会先要求确认/);
  assert.match(page, /会保留原答案版本并要求你重新阅读题目/);
  const validatedAt = app.indexOf('restorePrivateProgressReceipt(pack, record)');
  const confirmedAt = app.indexOf('window.confirm(');
  const overwrittenAt = app.indexOf('saved.set(session.season');
  assert.ok(validatedAt >= 0 && validatedAt < confirmedAt && confirmedAt < overwrittenAt);
  assert.match(app, /wouldDiscardLocalAnswers\(previous\.answers, session\.answers\)/);
  assert.match(app, /if \(!window\.confirm\([\s\S]*?return;[\s\S]*?saved\.set\(session\.season/);
  assert.doesNotMatch(app, /\b(fetch|XMLHttpRequest|localStorage|sessionStorage|sendBeacon)\s*\(/);
});

test('unsaved choices guard refresh/navigation without silently persisting sensitive answers', () => {
  assert.match(app, /window\.addEventListener\('beforeunload', confirmLeavingWithUnsavedChoices\)/);
  assert.match(app, /window\.removeEventListener\('beforeunload', confirmLeavingWithUnsavedChoices\)/);
  assert.match(app, /event\.preventDefault\(\)/);
  assert.match(app, /event\.returnValue = ''/);
  assert.match(app, /active\.backupStale = true/);
  assert.match(app, /active\.backupStale = false/);
  assert.match(app, /backupStale: false, \/\/ The imported file remains the backup/);
  assert.match(page, /提醒不等于自动保存/);
  assert.doesNotMatch(app, /\b(fetch|XMLHttpRequest|localStorage|sessionStorage|sendBeacon)\s*\(/);
});

test('a download request alone cannot silence the warning for unsaved private answers', () => {
  // Browsers do not expose whether the download reached the user's disk.
  // Only the visitor's explicit confirmation can mark the in-memory choices backed up.
  assert.match(page, /id="full-confirm-progress-backup"[^>]*hidden/);
  assert.match(page, /id="full-confirm-complete-backup"[^>]*hidden/);
  assert.match(page, /浏览器发起下载不等于文件已保存/);
  assert.match(app, /active\.pendingBackupKind = 'progress'/);
  assert.match(app, /active\.pendingBackupKind = 'complete'/);
  const downloadFlow = app.slice(app.indexOf('function download()'), app.indexOf('async function importProgress'));
  assert.doesNotMatch(downloadFlow, /active\.backupStale = false/);
  const confirm = app.slice(app.indexOf('function confirmDownloadedBackup(kind)'), app.indexOf("'full-confirm-progress-backup').addEventListener") + 60);
  assert.match(confirm, /active\.pendingBackupKind !== kind/);
  assert.match(confirm, /active\.backupStale = false/);
  assert.match(confirm, /syncUnloadGuard\(\)/);
  assert.match(app, /active\.pendingBackupKind = null; \/\/ A new choice invalidates any unconfirmed download/);
  assert.match(app, /document\.body\.append\(a\)/);
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


test('sparse resume at final question must redirect to the first unanswered question before finishing', () => {
  const finish = app.match(/function finish\(\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(finish, 'finish handler exists');
  const findAt = finish.indexOf('questions.findIndex(q => !Object.hasOwn(active.answers, q.id))');
  const renderAt = finish.indexOf('render()');
  const summaryAt = finish.indexOf('summarizeUnscoredAnswers(pack, active.season, active.answers, active.answerVersions, active.answerFingerprints)');
  assert.ok(findAt >= 0 && findAt < renderAt && renderAt < summaryAt,
    'finish checks completeness before creating a receipt');
  assert.match(finish, /active\.index = firstMissing/);
  assert.match(finish, /full-save-status/);
  assert.match(finish, /return;/);
});

test("deep links entering a season directly retain disclosures inside the quiz pane", () => {
  assert.match(app, /if \(fromUrl ===/);
  const quiz = page.match(/<section id="full-quiz"[\s\S]*?<\/section>/)?.[0];
  assert.ok(quiz, "direct-entry quiz pane must exist");
  for (const disclosure of ["非官方试填", "AI 初译", "未经真人双语审校", "许可原件未独立核验", "没有官方计分", "不自动上传"]) {
    assert.ok(quiz.includes(disclosure), "direct entry must show: " + disclosure);
  }
  assert.match(quiz, /class="full-quiz-disclosure" role="note"/);
});

test('AI idiom reader notes appear after the literal Chinese prompt, never as official wording', () => {
  const marker = page.indexOf('id="full-reader-note"');
  assert.ok(marker > page.indexOf('id="full-zh"') && marker < page.indexOf('id="full-choices"'));
  assert.match(page, /id="full-reader-note"[^>]*role="note" hidden/);
  assert.match(app, /note.hidden = !q.readerNote/);
  assert.match(app, /note.textContent = q.readerNote \|\| ''/);
});


test('S1 generated client-group labels are disclosed as local Chinese descriptions in quiz and completion', () => {
  // S1 uses source-array group keys, not official Korean group-name strings.
  // Do not let a friendly Chinese label imply that the show named a scored axis.
  assert.match(app, /本站中文题组说明（依据客户端分类索引，非官方题组名）/);
  assert.match(app, /来源索引 \\$\{q\.id\}（本站根据客户端数组位置生成，非官方题号）/);
  assert.match(app, /active\.season === 1[\\s\\S]*?本站中文题组说明（非官方题组名）/);
  // The S2 original Korean domain remains visibly upstream of the Chinese draft.
  assert.match(app, /koreanGroup\.lang = 'ko'/);
  assert.match(app, /originalGroupNames\?\.has\(group\.label\)/);
});
