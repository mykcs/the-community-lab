import {
  summarizeUnscoredAnswers,
  createPrivateProgressReceipt,
  restorePrivateProgressReceipt,
  wouldDiscardLocalAnswers,
  countReplacedLocalAnswerProvenance,
} from './lib/full-questionnaire.mjs';

const pack = JSON.parse(document.getElementById('full-questionnaire-data').textContent);
const $ = id => document.getElementById(id);
const panes = { select: $('full-select'), quiz: $('full-quiz'), done: $('full-done') };
const saved = new Map();
const groupNames = {
  politics: '公共与政治', gender: '性别观念', openness: '开放与变化', class: '阶级与生活经历',
};
let active = null;

function make(tag, className = '', text = null) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== null) element.textContent = String(text);
  return element;
}

function view(name) {
  for (const [key, panel] of Object.entries(panes)) panel.hidden = name !== key;
  window.scrollTo({ top: 0, behavior: 'instant' });
  const title = name === 'quiz' ? $('full-ko') : name === 'done' ? $('full-done-title') : $('full-title');
  title.focus({ preventScroll: true });
}

function begin(season, fresh = false) {
  if (![1, 2].includes(season)) return;
  if (fresh || !saved.has(season)) saved.set(season, {
    season, index: 0, answers: Object.create(null),
    answerVersions: Object.create(null), answerFingerprints: Object.create(null), needsReview: new Set(),
  });
  active = saved.get(season);
  render();
  view('quiz');
}

function selectSeason() {
  for (const season of [1, 2]) {
    const session = saved.get(season);
    const answered = session ? Object.keys(session.answers).length : 0;
    const pending = session?.needsReview?.size || 0;
    document.querySelector(`[data-season-progress="${season}"]`).textContent = answered
      ? `本页已答 ${answered} / ${pack.seasons[season].length}${pending ? ` · ${pending} 道译文需重新确认` : ''} · 继续 ↗`
      : '开始完整试填 ↗';
  }
  view('select');
}

function render() {
  const questions = pack.seasons[active.season];
  const q = questions[active.index];
  const answered = Object.keys(active.answers).length;
  $('full-season-tag').textContent = `SEASON 0${active.season} / SOURCE DRAFT`;
  $('full-position').textContent = `第 ${String(active.index + 1).padStart(2, '0')} / ${questions.length} 题`;
  $('full-count').textContent = `已答 ${answered} / ${questions.length} 题${active.needsReview?.size ? ` · ${active.needsReview.size} 道译文待重新确认` : ''}`;
  $('full-progress').max = questions.length;
  $('full-progress').value = answered;
  $('full-group').textContent = `题组 · ${groupNames[q.group] || q.group} · 原题编号 ${q.id}`;
  $('full-ko').textContent = q.sourceKo;
  $('full-zh').textContent = q.draftZh;
  const note = $('full-reader-note');
  note.hidden = !q.readerNote;
  note.textContent = q.readerNote || '';
  $('full-choice-prompt').textContent = q.options.length === 2
    ? '请选择一个更符合你观点的选项；下方韩文为公开客户端文字。'
    : `请选择一个选项（原题为 ${q.options.length} 级量表）。`;
  $('full-source').href = q.sourceUrl;
  const list = $('full-choices');
  list.replaceChildren();
  for (const [index, choice] of q.options.entries()) {
    const btn = make('button', 'full-choice');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(active.answers[q.id] === choice.value));
    btn.setAttribute('aria-label', `${choice.ko} / ${choice.zh}`);
    const mark = make('span', 'full-choice-mark', q.options.length === 2 ? (index === 0 ? 'O' : 'X') : index + 1);
    mark.setAttribute('aria-hidden', 'true');
    const copy = make('span', 'full-choice-copy');
    const ko = make('span', 'full-choice-ko', choice.ko); ko.lang = 'ko';
    copy.append(ko, make('span', 'full-choice-zh', choice.zh));
    btn.append(mark, copy);
    btn.addEventListener('click', () => {
      active.answers[q.id] = choice.value;
      active.answerVersions[q.id] = q.translationVersion;
      active.answerFingerprints[q.id] = q.translationFingerprint;
      active.needsReview?.delete(q.id);
      for (const entry of list.children) entry.setAttribute('aria-pressed', String(entry === btn));
      $('full-next').disabled = false;
      $('full-count').textContent = `已答 ${Object.keys(active.answers).length} / ${questions.length} 题${active.needsReview?.size ? ` · ${active.needsReview.size} 道译文待重新确认` : ''}`;
      $('full-progress').value = Object.keys(active.answers).length;
      $('full-save').disabled = false;
      $('full-save-status').textContent = '';
    });
    list.append(btn);
  }
  $('full-prev').disabled = active.index === 0;
  $('full-next').disabled = !Object.hasOwn(active.answers, q.id) || active.needsReview?.has(q.id);
  $('full-next').textContent = active.index === questions.length - 1 ? '完成本季答题 →' : '确认，继续 →';
  $('full-save').disabled = answered === 0;
  $('full-save-status').textContent = active.needsReview?.has(q.id)
    ? '这道题的中文 AI 译文已经更新；请阅读韩文和新中文后重新点击选项，才能继续。'
    : (active.needsReview?.size ? `还有 ${active.needsReview.size} 道旧译文答案待重新确认。` : '');
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
  active.receipt = summary;
  $('full-done-description').textContent = `第 ${active.season} 季 ${summary.questionCount} 道题已全部作答。你的选择留在本机内存，本站没有发送给原站或计算官方分数。`;
  const panel = $('full-group-summary');
  panel.replaceChildren();
  for (const group of summary.groups) {
    const item = make('div');
    item.append(make('span', '', groupNames[group.label] || group.label), make('strong', '', `${group.answered} 道已答`));
    panel.append(item);
  }
  view('done');
}

function downloadJson(record, filename) {
  const blob = new Blob([JSON.stringify(record, null, 2) + '\n'], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = make('a'); a.href = url; a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function download() {
  if (!active?.receipt) return;
  downloadJson({
    ...active.receipt,
    notice: '本机私人答题记录；不是官方分数或人物匹配。未经人工双语复核。请勿上传公开仓库。',
  }, `community-source-draft-season-${active.season}-answers.json`);
}

function saveProgress() {
  if (!active || Object.keys(active.answers).length === 0) return;
  const record = createPrivateProgressReceipt(pack, active.season, active.answers, active.index, active.answerVersions, active.answerFingerprints);
  downloadJson({
    ...record,
    notice: '此 JSON 含个人敏感观点，仅供本人恢复本机试填；非官方成绩，请勿上传公开仓库。',
  }, `community-private-season-${active.season}-progress.json`);
  $('full-save-status').textContent = '已生成本机进度文件 · 请妥善保管';
}

async function importProgress(file) {
  const status = $('full-import-status');
  if (!file) return;
  if (file.size > 128 * 1024) {
    status.textContent = '文件过大；只接受本站导出的 128 KB 以内 JSON。';
    return;
  }
  try {
    const record = JSON.parse(await file.text());
    const session = restorePrivateProgressReceipt(pack, record);
    const previous = saved.get(session.season);
    const discardsLocal = previous && wouldDiscardLocalAnswers(previous.answers, session.answers);
    const overwrittenProvenance = previous ? countReplacedLocalAnswerProvenance(previous, session) : 0;
    const changed = session.changedQuestionIds.length;
    if (discardsLocal || changed || overwrittenProvenance) {
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
    });
    active = saved.get(session.season);
    if (session.complete && !changed) finish();
    else {
      render();
      view('quiz');
      $('full-save-status').textContent = changed
        ? `已保留 ${session.answeredCount} 道旧答案；请重新确认 ${changed} 道更新译文的选择。`
        : `已恢复第 ${session.season} 季 ${session.answeredCount} 道答案`;
    }
    status.textContent = '';
  } catch {
    status.textContent = '恢复失败：文件可能损坏，或题目来源、选项值或文件格式不匹配。原有进度未改动。';
  }
}

document.querySelectorAll('[data-start-season]').forEach(button => {
  button.addEventListener('click', () => begin(Number(button.dataset.startSeason)));
});
$('full-exit').addEventListener('click', selectSeason);
$('full-prev').addEventListener('click', () => {
  if (active.index > 0) { active.index -= 1; render(); }
});
$('full-next').addEventListener('click', () => {
  const q = pack.seasons[active.season][active.index];
  if (!Object.hasOwn(active.answers, q.id)) return;
  if (active.index < pack.seasons[active.season].length - 1) { active.index += 1; render(); }
  else finish();
});
$('full-download').addEventListener('click', download);
$('full-save').addEventListener('click', saveProgress);
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
