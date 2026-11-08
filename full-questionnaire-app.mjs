import {
  summarizeUnscoredAnswers,
  createPrivateProgressReceipt,
  restorePrivateProgressReceipt,
  wouldDiscardLocalAnswers,
  countReplacedLocalAnswerProvenance,
  hasUnsavedPrivateChoices,
} from './lib/full-questionnaire.mjs';
import { displayedOptionCopy } from './lib/option-display.mjs';
import { s1GroupDraftLabel } from './lib/group-display.mjs';

const pack = JSON.parse(document.getElementById('full-questionnaire-data').textContent);
const $ = id => document.getElementById(id);
const panes = { select: $('full-select'), quiz: $('full-quiz'), done: $('full-done') };
const saved = new Map();
let active = null;
// Reading a local JSON file is async. A previously chosen, slower file must
// never overwrite the more recent import selection or prompt to erase it.
let latestImportRequest = 0;
let pendingImportRequest = 0;

// A later deliberate answer, restart, or navigation takes precedence over a
// still-reading local file; never silently restore an obsolete snapshot.
function cancelPendingImport() {
  if (!pendingImportRequest) return;
  latestImportRequest += 1;
  pendingImportRequest = 0;
  $('full-import-status').textContent = '已取消尚未完成的备份导入：你随后操作了答题页面。如需恢复，请重新选择文件。';
}

function unknownWordingCount(session) {
  return Object.keys(session?.answers ?? {}).filter(
    id => session.answerFingerprints?.[id] === null,
  ).length;
}

function confirmLeavingWithUnsavedChoices(event) {
  if (!hasUnsavedPrivateChoices(saved.values())) return;
  event.preventDefault();
  event.returnValue = ''; // Legacy browsers; modern browsers display their own wording.
}

function syncUnloadGuard() {
  // Avoid disabling Firefox's back/forward cache when there is no data at risk.
  window.removeEventListener('beforeunload', confirmLeavingWithUnsavedChoices);
  if (hasUnsavedPrivateChoices(saved.values())) {
    window.addEventListener('beforeunload', confirmLeavingWithUnsavedChoices);
  }
}

function make(tag, className = '', text = null) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== null) element.textContent = String(text);
  return element;
}

// Chinese guidance quotes historical Korean placeholder tokens.
// Preserve the visible text exactly and mark only the Korean tokens.
function localizedOptionHint(tag, className, hint) {
  const wrapper = make(tag, className);
  for (const part of hint.split(/([25]점)/gu)) {
    if (!part) continue;
    if (/^[25]점$/u.test(part)) {
      const ko = make('span', '', part);
      ko.lang = 'ko';
      wrapper.append(ko);
    } else {
      wrapper.append(document.createTextNode(part));
    }
  }
  return wrapper;
}

function view(name) {
  for (const [key, panel] of Object.entries(panes)) panel.hidden = name !== key;
  window.scrollTo({ top: 0, behavior: 'instant' });
  const title = name === 'quiz' ? $('full-ko') : name === 'done' ? $('full-done-title') : $('full-title');
  title.focus({ preventScroll: true });
}

function begin(season, fresh = false) {
  if (![1, 2].includes(season)) return;
  cancelPendingImport();
  if (fresh || !saved.has(season)) saved.set(season, {
    season, index: 0, answers: Object.create(null),
    answerVersions: Object.create(null), answerFingerprints: Object.create(null), needsReview: new Set(),
    backupStale: false, reviewMode: false, pendingBackupKind: null,
  });
  active = saved.get(season);
  syncUnloadGuard();
  // A finished private session should reopen its own unscored answer record,
  // not send the visitor back to the last question as if unfinished.
  // The explicit "edit" action clears the receipt and still resumes the quiz.
  if (active.receipt && !active.reviewMode && !active.needsReview?.size) {
    finish();
    return;
  }
  render();
  view('quiz');
}

function selectSeason() {
  cancelPendingImport();
  for (const season of [1, 2]) {
    const session = saved.get(season);
    const answered = session ? Object.keys(session.answers).length : 0;
    const pending = session?.needsReview?.size || 0;
    const unknown = unknownWordingCount(session);
    const complete = Boolean(session?.receipt && !session.reviewMode && !pending &&
      answered === pack.seasons[season].length);
    document.querySelector(`[data-season-progress="${season}"]`).textContent = complete
      ? `本页已完成 ${answered} / ${pack.seasons[season].length} · 查看本机答题记录 ↗`
      : answered
        ? `本页已答 ${answered} / ${pack.seasons[season].length}${pending ? ` · ${pending} 道译文需重新确认` : ''}${unknown ? ` · ${unknown} 道历史译文未知` : ''} · 继续 ↗`
        : '开始已观测题目试填 ↗';
  }
  view('select');
}

function updateProgress(questions) {
  const answered = Object.keys(active.answers).length;
  const unknown = unknownWordingCount(active);
  const reviewCount = active.needsReview?.size || 0;
  $('full-count').textContent = `已答 ${answered} / ${questions.length} 题${reviewCount ? ` · ${reviewCount} 道译文待重新确认` : ''}${unknown ? ` · ${unknown} 道历史译文未知` : ''}`;
  $('full-progress').max = questions.length;
  $('full-progress').value = answered;
  $('full-announcement').textContent = `第 ${active.index + 1} / ${questions.length} 题；已答 ${answered} / ${questions.length} 题。`;
}

function render() {
  const questions = pack.seasons[active.season];
  const q = questions[active.index];
  const answered = Object.keys(active.answers).length;
  const unknown = unknownWordingCount(active);
  $('full-season-tag').textContent = `SEASON 0${active.season} / SOURCE DRAFT`;
  $('full-position').textContent = `第 ${String(active.index + 1).padStart(2, '0')} / ${questions.length} 题`;
  updateProgress(questions);
  const group = $('full-group');
  if (q.season === 2) {
    // The S2 domains are part of the official client's Korean wording.
    // Keep them visible ahead of the AI Chinese draft, with language metadata.
    const koreanGroup = make('span', '', q.groupKo);
    koreanGroup.lang = 'ko';
    group.replaceChildren(
      make('span', '', '题组 · '), koreanGroup,
      make('span', '', ` / ${q.group} · 原题编号 ${q.id}（客户端原有 ID）`),
    );
  } else {
    group.textContent = `本站中文题组说明（依据客户端分类索引，非官方题组名） · ${s1GroupDraftLabel(q.group)} · 原题编号 ${q.id}（本站根据客户端数组位置生成的索引，非官方题号）`;
  }
  $('full-ko').textContent = q.sourceKo;
  $('full-zh').textContent = q.draftZh;
  const note = $('full-reader-note');
  note.hidden = !q.readerNote;
  note.textContent = q.readerNote || '';
  $('full-choice-prompt').textContent = q.options.length === 2
    ? '请选择一个更符合你观点的选项；下方韩文为公开客户端文字。'
    : `请选择一个选项（原题为 ${q.options.length} 级量表）。`;
  $('full-source').href = q.sourceUrl;
  // Open a voluntary PUBLIC feedback page with source identity only. Never
  // encode choices, translated question text, private backups or session state.
  const feedback = new URL('https://github.com/mykcs/the-community-lab/issues/new');
  feedback.searchParams.set('title', `韩中译文建议 · 第 ${q.season} 季 · ${q.id}`);
  feedback.searchParams.set('body', `季别：第 ${q.season} 季\n源题索引：${q.id}\n\n建议修改的中文和语义依据（请勿填写自己的答案、真实姓名或私人资料）：\n\n韩中双语来源或审校证据（如有）：\n\n此建议仅是反馈，不代表独立人工复核通过。`);
  $('full-report-translation').href = feedback.toString();
  // Expose the pinned public client asset, not an invented questionnaire or scoring version.
  $('full-source-fingerprint').textContent = `${pack.sourceSha256} · ${pack.observedAt}`;
  const list = $('full-choices');
  list.replaceChildren();
  const selectedIndex = q.options.findIndex(option => active.answers[q.id] === option.value);
  // Keep the original source value and Korean wording; the layout hint is not an official label.
  list.dataset.optionCount = String(q.options.length);
  for (const [index, choice] of q.options.entries()) {
    const btn = make('button', 'full-choice');
    btn.type = 'button';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(active.answers[q.id] === choice.value));
    // Roving tabindex: Tab enters the selected option, or the first if none.
    btn.tabIndex = index === (selectedIndex >= 0 ? selectedIndex : 0) ? 0 : -1;
    // The accessible name must expose the ORIGINAL source option value (O/X
    // or 1-6). Let nested text provide the name: aria-label would override
    // this value and the Korean span's lang=ko for screen readers.
    const mark = make('span', 'full-choice-mark', choice.value);
    const copy = make('span', 'full-choice-copy');
    const display = displayedOptionCopy(q, choice);
    // No official Korean label exists at S1 six-step positions 2 and 5.
    // Never present a numeric draft placeholder as the original Korean prose.
    const ko = make('span', 'full-choice-ko',
      display.koreanLabel ?? '当前客户端此档无韩文文字标签');
    ko.lang = display.koreanLabel === null ? 'zh-CN' : 'ko';
    copy.append(ko, make('span', 'full-choice-zh', display.zh));
    if (display.hint) copy.append(localizedOptionHint('span', 'full-choice-hint', display.hint));
    btn.append(mark, copy);
    btn.addEventListener('click', () => {
      cancelPendingImport();
      active.answers[q.id] = choice.value;
      active.answerVersions[q.id] = q.translationVersion;
      active.answerFingerprints[q.id] = q.translationFingerprint;
      active.backupStale = true;
      active.pendingBackupKind = null; // A new choice invalidates any unconfirmed download.
      $('full-confirm-progress-backup').hidden = true;
      $('full-confirm-complete-backup').hidden = true;
      syncUnloadGuard();
      active.needsReview?.delete(q.id);
      for (const entry of list.children) {
        entry.setAttribute('aria-checked', String(entry === btn));
        entry.tabIndex = entry === btn ? 0 : -1;
      }
      $('full-next').disabled = false;
      updateProgress(questions);
      $('full-save').disabled = false;
      $('full-save').hidden = false;
      $('full-save-status').textContent = '';
      $('full-finish-review').disabled = Object.keys(active.answers).length !== questions.length || Boolean(active.needsReview?.size);
    });
    // Arrow keys should follow the VISIBLE layout without changing source
    // values or DOM order. S1's 4/6-point scales form two vertical columns
    // on desktop (1-2[-3] left, 3-4 / 4-6 right), but one column on mobile.
    // Moving right must not unexpectedly move down a row in a value scale.
    // Home/End always target the first/last ORIGINAL source option.
    btn.addEventListener('keydown', event => {
      const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1
        : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0;
      if (!direction && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      const count = list.children.length;
      let nextIndex;
      if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = count - 1;
      else if ((count === 4 || count === 6) &&
               !window.matchMedia('(max-width: 630px)').matches) {
        const rows = count / 2;
        const column = Math.floor(index / rows);
        const row = index % rows;
        nextIndex = ['ArrowLeft', 'ArrowRight'].includes(event.key)
          ? (1 - column) * rows + row
          : column * rows + (row + direction + rows) % rows;
      } else {
        nextIndex = (index + direction + count) % count;
      }
      const target = list.children[nextIndex];
      target.click();
      target.focus();
    });
    list.append(btn);
  }
  $('full-prev').disabled = active.index === 0;
  $('full-next').disabled = !Object.hasOwn(active.answers, q.id) || active.needsReview?.has(q.id);
  $('full-next').textContent = active.index === questions.length - 1 ? '完成本季答题 →' : '确认，继续 →';
  $('full-review-tools').hidden = !active.reviewMode;
  $('full-jump-position').max = String(questions.length);
  $('full-jump-position').value = String(active.index + 1);
  $('full-finish-review').disabled = answered !== questions.length || Boolean(active.needsReview?.size);
  $('full-save').disabled = answered === 0;
  $('full-save').hidden = answered === 0;
  $('full-confirm-progress-backup').hidden = active.pendingBackupKind !== 'progress';
  $('full-save-status').textContent = active.pendingBackupKind === 'progress'
    ? '已请求浏览器下载。请先核对 JSON 文件确实保存，再点击“我已确认文件保存”；否则离开页面仍会提示未备份。'
    : active.needsReview?.has(q.id)
    ? '这道题的中文 AI 译文已经更新；请阅读韩文和新中文后重新点击选项，才能继续。'
    : Object.hasOwn(active.answers, q.id) && active.answerFingerprints?.[q.id] === null
      ? '这道旧答案缺少历史中文文字指纹，无法核验当时读过的译文；重新点击选项可确认当前译文。'
      : active.needsReview?.size
        ? `还有 ${active.needsReview.size} 道旧译文答案待重新确认。`
        : unknown
          ? `还有 ${unknown} 道旧答案的历史中文文字不可核验，可返回对应题目重新确认。`
          : '';
  if (!panes.quiz.hidden) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    $('full-ko').focus({ preventScroll: true });
  }
}

function finish() {
  const questions = pack.seasons[active.season];
  const firstMissing = questions.findIndex(q => !Object.hasOwn(active.answers, q.id));
  if (firstMissing !== -1) {
    // A restored sparse progress file can point at the final question even
    // when earlier questions remain unanswered. Never lose the user's data.
    const missingCount = questions.length - Object.keys(active.answers).length;
    active.index = firstMissing;
    render();
    $('full-save-status').textContent = `还有 ${missingCount} 道未答题，已返回第 ${firstMissing + 1} 题补答；原有答案未更改。`;
    return;
  }
  const firstUnreviewed = questions.findIndex(q => active.needsReview?.has(q.id));
  if (firstUnreviewed !== -1) {
    active.index = firstUnreviewed;
    render();
    $('full-save-status').textContent = `还有 ${active.needsReview.size} 道译文更新后的选项需要重新确认，原答案已保留。`;
    return;
  }
  const summary = summarizeUnscoredAnswers(pack, active.season, active.answers, active.answerVersions, active.answerFingerprints);
  // A pending download confirmation belongs to the finished season. Reopening
  // it must not make visitors download their private answers a second time.
  const pendingCompleteBackup = Boolean(active.receipt && active.pendingBackupKind === 'complete');
  active.receipt = summary;
  active.reviewMode = false;
  active.pendingBackupKind = pendingCompleteBackup ? 'complete' : null;
  $('full-confirm-complete-backup').hidden = !pendingCompleteBackup;
  $('full-complete-backup-status').textContent = pendingCompleteBackup
    ? active.pendingBackupStatus : '';
  const unknown = unknownWordingCount(active);
  $('full-done-description').textContent = `第 ${active.season} 季 ${summary.questionCount} 道题已全部作答。你的选择留在本机内存，本站没有发送给原站或计算官方分数。${unknown ? ` 其中 ${unknown} 道旧答案缺少历史中文文字指纹，无法核验当时所见译文；可返回修改并重新点击选项确认当前译文。` : ''}`;
  const panel = $('full-group-summary');
  panel.replaceChildren();
  // Source group names remain part of the S2 Korean-first reading contract,
  // including the completed answer-count summary. Do not replace them with
  // unreviewed Chinese draft labels or imply an official scored result.
  const originalGroupNames = active.season === 2
    ? new Map(questions.map(q => [q.group, q.groupKo]))
    : null;
  for (const group of summary.groups) {
    const item = make('div');
    const label = make('span');
    if (originalGroupNames?.has(group.label)) {
      const ko = make('span', '', originalGroupNames.get(group.label));
      ko.lang = 'ko';
      label.append(ko, make('span', '', ` / ${group.label}`));
    } else {
      label.textContent = active.season === 1
        ? `本站中文题组说明（非官方题组名） · ${s1GroupDraftLabel(group.label)}`
        : group.label;
    }
    item.append(label, make('strong', '', `${group.answered} 道已答`));
    panel.append(item);
  }
  renderAnswerAudit(questions);
  view('done');
}

// Completed selections are inspectable on this device before a visitor
// compares them with the official test. This is NOT an official score or
// proof of identical source-site navigation.
function renderAnswerAudit(questions) {
  const list = $('full-answer-audit-list');
  list.replaceChildren();
  $('full-answer-audit').open = false;
  for (const [index, q] of questions.entries()) {
    const selected = q.options.find(option => option.value === active.answers[q.id]);
    const copy = displayedOptionCopy(q, selected);
    const row = make('li', 'full-answer-audit-item');
    const header = make('div', 'full-answer-audit-head');
    header.append(
      make('strong', '', `第 ${index + 1} 题 · 源题编号 ${q.id}${q.season === 1 ? '（本站生成索引，非官方题号）' : '（客户端原有 ID）'}`),
      make('span', '', `原始选项值：${String(selected.value)}`),
    );
    const korean = make('p', 'full-answer-audit-ko', q.sourceKo);
    korean.lang = 'ko';
    const chinese = make('p', 'full-answer-audit-zh', q.draftZh);
    chinese.lang = 'zh-CN';
    const chosenKo = make('span', '', copy.koreanLabel ?? '当前客户端此档无韩文文字标签');
    chosenKo.lang = copy.koreanLabel === null ? 'zh-CN' : 'ko';
    const chosen = make('p', 'full-answer-audit-choice');
    chosen.append(
      make('span', '', '已选选项：'),
      chosenKo,
      make('span', '', ` / ${copy.zh}（中文 AI 初译）`),
    );
    const edit = make('button', 'button button-outline', '修改这道题');
    edit.type = 'button';
    edit.setAttribute('aria-label', `修改第 ${index + 1} 题`);
    edit.addEventListener('click', () => editCompletedAnswer(index));
    row.append(header, korean, chinese);
    // The completion audit must preserve the same reading context shown
    // during answering. Omitting a culture/ambiguity note or a blank-scale
    // explanation could make a historical choice look more certain than it is.
    if (q.readerNote) row.append(make('p', 'full-answer-audit-note', q.readerNote));
    row.append(chosen);
    if (copy.hint) row.append(localizedOptionHint('p', 'full-answer-audit-hint', copy.hint));
    // A legacy backup may preserve the raw source answer but not the exact
    // Chinese text shown when it was chosen. Never present today's AI wording
    // as if it were verified historical answer provenance.
    if (active.answerFingerprints?.[q.id] === null) {
      row.append(make(
        'p', 'full-answer-audit-provenance',
        '历史中文译文未知：这里展示的是当前 AI 初译，不能证明答题当时看到的中文与今天相同。请按需重新阅读原文并确认选项。',
      ));
    }
    row.append(edit);
    list.append(row);
  }
}

function editCompletedAnswer(index) {
  if (!active?.receipt || !Number.isInteger(index) ||
      index < 0 || index >= pack.seasons[active.season].length) return;
  cancelPendingImport();
  active.index = index;
  active.receipt = null;
  active.reviewMode = true;
  active.pendingBackupKind = null;
  $('full-confirm-complete-backup').hidden = true;
  $('full-jump-status').textContent = '';
  render();
  view('quiz');
}

function downloadJson(record, filename) {
  const blob = new Blob([JSON.stringify(record, null, 2) + '\n'], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = make('a'); a.href = url; a.download = filename;
  // WebKit may ignore a detached anchor; keep it in the document for the click.
  document.body.append(a);
  try { a.click(); } finally { a.remove(); }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function download() {
  if (!active?.receipt) return;
  // Exporting the current private record supersedes a slower, older import.
  cancelPendingImport();
  downloadJson({
    ...active.receipt,
    notice: '本机私人答题记录；不是官方分数或人物匹配。未经人工双语复核。请勿上传公开仓库。',
  }, `community-source-draft-season-${active.season}-answers.json`);
  // A programmatic click cannot prove that a browser/OS actually saved a file.
  // Never silence the unsaved-answer warning until the visitor checks it.
  active.pendingBackupKind = 'complete';
  $('full-confirm-complete-backup').hidden = false;
  $('full-complete-backup-status').textContent = '已请求浏览器下载。请检查文件确实存在，再点击“我已确认文件保存”。';
  active.pendingBackupStatus = $('full-complete-backup-status').textContent;
}

function saveProgress() {
  if (!active || Object.keys(active.answers).length === 0) return;
  // The user chose to back up THIS in-memory state, not an in-flight file.
  cancelPendingImport();
  const record = createPrivateProgressReceipt(pack, active.season, active.answers, active.index, active.answerVersions, active.answerFingerprints);
  downloadJson({
    ...record,
    notice: '此 JSON 含个人敏感观点，仅供本人恢复本机试填；非官方成绩，请勿上传公开仓库。',
  }, `community-private-season-${active.season}-progress.json`);
  active.pendingBackupKind = 'progress';
  $('full-confirm-progress-backup').hidden = false;
  $('full-save-status').textContent = '已请求浏览器下载。请先核对 JSON 文件确实保存，再点击“我已确认文件保存”；否则离开页面仍会提示未备份。';
}

async function importProgress(file) {
  const status = $('full-import-status');
  if (!file) return;
  const requestId = ++latestImportRequest;
  pendingImportRequest = requestId;
  if (file.size > 128 * 1024) {
    pendingImportRequest = 0;
    status.textContent = '文件过大；只接受本站导出的 128 KB 以内 JSON。';
    return;
  }
  try {
    const content = await file.text();
    if (requestId !== latestImportRequest) return; // Superseded while reading.
    const record = JSON.parse(content);
    const session = restorePrivateProgressReceipt(pack, record);
    const previous = saved.get(session.season);
    const discardsLocal = previous && wouldDiscardLocalAnswers(previous.answers, session.answers);
    const overwrittenProvenance = previous ? countReplacedLocalAnswerProvenance(previous, session) : 0;
    const changed = session.changedQuestionIds.length;
    const unknown = session.unknownWordingQuestionIds.length;
    if (discardsLocal || changed || overwrittenProvenance || unknown) {
      const reasons = [
        discardsLocal
          ? `第 ${session.season} 季已有 ${Object.keys(previous.answers).length} 道答案；导入会覆盖或删除部分选择，无法撤销。`
          : '',
        changed
          ? `其中 ${changed} 道题的中文 AI 译文文字或版本与备份不一致。原始韩文来源和选项值仍匹配，旧选择会保留，但需要在当前译文下逐题重新确认。`
          : '',
        overwrittenProvenance
          ? `还有 ${overwrittenProvenance} 道已有答案的选项值相同，但导入会替换本页记录的中文译文版本或文字指纹（旧备份可能使指纹变成历史未知）。建议先下载当前进度 JSON 备份。`
          : '',
        unknown
          ? `有 ${unknown} 道答案没有历史中文文字指纹，无法证明当时看过的译文与现在相同；导入后保留原始选项值及 UNKNOWN，不会伪造新指纹。可逐题重新点击确认当前译文。`
          : '',
      ].filter(Boolean);
      if (!window.confirm(`${reasons.join('\n')}
确定继续导入？`)) {
        status.textContent = '已取消恢复；本页现有答案和题位均未改变。';
        return;
      }
    }
    const currentQuestions = pack.seasons[session.season];
    const firstChanged = currentQuestions.findIndex(q => session.changedQuestionIds.includes(q.id));
    saved.set(session.season, {
      season: session.season,
      index: firstChanged >= 0 ? firstChanged : session.index,
      answers: session.answers,
      answerVersions: session.answerVersions,
      answerFingerprints: session.answerFingerprints,
      needsReview: new Set(session.changedQuestionIds),
      reviewMode: session.complete,
      backupStale: false, // The imported file remains the backup until a new choice.
      pendingBackupKind: null,
    });
    active = saved.get(session.season);
    syncUnloadGuard();
    if (session.complete && !changed) finish();
    else {
      render();
      view('quiz');
      $('full-save-status').textContent = changed
        ? `已保留 ${session.answeredCount} 道旧答案；请重新确认 ${changed} 道更新译文的选择。`
        : unknown
          ? `已恢复 ${session.answeredCount} 道答案；其中 ${unknown} 道缺少历史中文文字指纹。旧答案没有被改写，可逐题重新确认当前译文。`
          : `已恢复第 ${session.season} 季 ${session.answeredCount} 道答案`;
    }
    status.textContent = '';
  } catch {
    if (requestId !== latestImportRequest) return; // Do not replace newer status.
    status.textContent = '恢复失败：文件可能损坏，或题目来源、选项值或文件格式不匹配。原有进度未改动。';
  } finally {
    if (pendingImportRequest === requestId) pendingImportRequest = 0;
  }
}

document.querySelectorAll('[data-start-season]').forEach(button => {
  button.addEventListener('click', () => begin(Number(button.dataset.startSeason)));
});
$('full-exit').addEventListener('click', selectSeason);
$('full-prev').addEventListener('click', () => {
  if (active.index > 0) { cancelPendingImport(); active.index -= 1; render(); }
});
function jumpToReviewedQuestion() {
  if (!active?.reviewMode) return;
  const raw = $('full-jump-position').value.trim();
  const position = Number(raw);
  const length = pack.seasons[active.season].length;
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(position) || position < 1 || position > length) {
    $('full-jump-status').textContent = `请输入 1 至 ${length} 之间的整数题位。`;
    return;
  }
  cancelPendingImport();
  active.index = position - 1;
  $('full-jump-status').textContent = '';
  render();
}
$('full-jump').addEventListener('click', jumpToReviewedQuestion);
$('full-jump-position').addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  jumpToReviewedQuestion();
});
$('full-finish-review').addEventListener('click', () => {
  if (!active?.reviewMode) return;
  cancelPendingImport();
  finish(); // Recompute from current selections; never reuse an old completed receipt.
});
$('full-next').addEventListener('click', () => {
  const q = pack.seasons[active.season][active.index];
  if (!Object.hasOwn(active.answers, q.id)) return;
  cancelPendingImport();
  if (active.index < pack.seasons[active.season].length - 1) { active.index += 1; render(); }
  else finish();
});
$('full-download').addEventListener('click', download);
$('full-edit').addEventListener('click', () => {
  // Preserve the existing last-question edit shortcut.
  if (active) editCompletedAnswer(pack.seasons[active.season].length - 1);
});
$('full-save').addEventListener('click', saveProgress);
function confirmDownloadedBackup(kind) {
  if (!active || active.pendingBackupKind !== kind) return;
  // A newer explicit confirmation must not be undone by a stale file read.
  cancelPendingImport();
  // A confirmation belongs to this exact in-memory season and to the last
  // download request. Answer edits clear pendingBackupKind before this point.
  active.pendingBackupKind = null;
  active.backupStale = false;
  syncUnloadGuard();
  if (kind === 'progress') {
    $('full-confirm-progress-backup').hidden = true;
    $('full-save-status').textContent = '已按你的确认标记为已备份；请保管私人 JSON 文件。';
  } else {
    $('full-confirm-complete-backup').hidden = true;
    $('full-complete-backup-status').textContent = '已按你的确认标记为已备份；请保管私人 JSON 文件。';
  }
}
$('full-confirm-progress-backup').addEventListener('click', () => confirmDownloadedBackup('progress'));
$('full-confirm-complete-backup').addEventListener('click', () => confirmDownloadedBackup('complete'));
$('full-import').addEventListener('click', () => $('full-import-file').click());
$('full-import-file').addEventListener('change', event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  void importProgress(file);
});
$('full-restart').addEventListener('click', () => {
  if (!active) return;
  const answered = Object.keys(active.answers).length;
  if (answered > 0 && !window.confirm(
    `第 ${active.season} 季已经回答了 ${answered} 道题。重新开始会清空本页该季的全部答案，无法撤销。建议先下载 JSON 备份。确定重新开始？`,
  )) return;
  begin(active.season, true);
});
$('full-back').addEventListener('click', selectSeason);

const fromUrl = new URLSearchParams(window.location.search).get('season');
if (fromUrl === '1' || fromUrl === '2') begin(Number(fromUrl));
