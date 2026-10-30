import { summarizeUnscoredAnswers } from './lib/full-questionnaire.mjs';

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
  if (fresh || !saved.has(season)) saved.set(season, { season, index: 0, answers: Object.create(null) });
  active = saved.get(season);
  render();
  view('quiz');
}

function selectSeason() {
  for (const season of [1, 2]) {
    const session = saved.get(season);
    const answered = session ? Object.keys(session.answers).length : 0;
    document.querySelector(`[data-season-progress="${season}"]`).textContent = answered
      ? `本页已答 ${answered} / ${pack.seasons[season].length} · 继续 ↗`
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
  $('full-count').textContent = `已答 ${answered} / ${questions.length} 题`;
  $('full-progress').max = questions.length;
  $('full-progress').value = answered;
  $('full-group').textContent = `题组 · ${groupNames[q.group] || q.group} · 原题编号 ${q.id}`;
  $('full-ko').textContent = q.sourceKo;
  $('full-zh').textContent = q.draftZh;
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
      for (const entry of list.children) entry.setAttribute('aria-pressed', String(entry === btn));
      $('full-next').disabled = false;
      $('full-count').textContent = `已答 ${Object.keys(active.answers).length} / ${questions.length} 题`;
      $('full-progress').value = Object.keys(active.answers).length;
    });
    list.append(btn);
  }
  $('full-prev').disabled = active.index === 0;
  $('full-next').disabled = !Object.hasOwn(active.answers, q.id);
  $('full-next').textContent = active.index === questions.length - 1 ? '完成本季答题 →' : '确认，继续 →';
  if (!panes.quiz.hidden) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    $('full-ko').focus({ preventScroll: true });
  }
}

function finish() {
  const summary = summarizeUnscoredAnswers(pack, active.season, active.answers);
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

function download() {
  if (!active?.receipt) return;
  const record = { ...active.receipt,
    notice: '本机私人答题记录；不是官方分数或人物匹配。未经人工双语复核。请勿上传公开仓库。',
  };
  const blob = new Blob([JSON.stringify(record, null, 2) + '\n'], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = make('a'); a.href = url; a.download = `community-source-draft-season-${active.season}-answers.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
$('full-restart').addEventListener('click', () => begin(active.season, true));
$('full-back').addEventListener('click', selectSeason);

const fromUrl = new URLSearchParams(window.location.search).get('season');
if (fromUrl === '1' || fromUrl === '2') begin(Number(fromUrl));
