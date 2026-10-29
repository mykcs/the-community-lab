import { SEASONS } from './data/questions.mjs';
import { scoreAnswers, validateSeason } from './lib/quiz.mjs';

for (const season of Object.values(SEASONS)) validateSeason(season);

// Only in-memory state: answers never leave this browser tab or enter URL/logs/storage.
const state = { seasonId: null, index: 0, answers: {}, view: 'home', result: null };
const $ = (id) => document.getElementById(id);
const views = { home: $('home-view'), quiz: $('quiz-view'), result: $('result-view') };

function node(tag, className = '', content = null) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== null) element.textContent = String(content);
  return element;
}

function switchView(name) {
  for (const [key, view] of Object.entries(views)) view.hidden = key !== name;
  state.view = name;
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function begin(seasonId, fresh = false) {
  if (!SEASONS[seasonId]) return;
  if (fresh || state.seasonId !== seasonId || state.view === 'result') {
    state.seasonId = seasonId;
    state.index = 0;
    state.answers = {};
    state.result = null;
  }
  renderQuestion();
  switchView('quiz');
}

function showHome() {
  switchView('home');
  // Pausing a quiz keeps progress in memory only, until this tab is refreshed or closed.
  const hasProgress = state.seasonId && Object.keys(state.answers).length > 0 && state.result === null;
  $('hero-start').firstChild.textContent = hasProgress && state.seasonId === 2 ? '继续第二季示例测试 ' : '开始第二季示例测试 ';
}

function renderQuestion() {
  const season = SEASONS[state.seasonId];
  const question = season.questions[state.index];
  const axis = season.axes.find((entry) => entry.id === question.axis);
  const count = season.questions.length;
  const currentNumber = String(state.index + 1).padStart(2, '0');
  const totalNumber = String(count).padStart(2, '0');
  $('quiz-season-label').textContent = `SEASON ${String(season.id).padStart(2, '0')} / ORIGINAL DEMO`;
  $('quiz-count').textContent = `QUESTION ${currentNumber} / ${totalNumber}`;
  const percentage = Math.round(((state.index + 1) / count) * 100);
  $('quiz-percent').textContent = `${percentage}%`;
  $('quiz-progress').style.width = `${percentage}%`;
  $('quiz-axis-name').textContent = axis.name;
  $('question-ko').textContent = question.source_text_ko;
  $('question-zh').textContent = question.translation_zh_cn;
  $('answer-instruction').textContent = season.prompt;
  const container = $('answer-options');
  container.replaceChildren();
  for (const [index, choice] of question.options.entries()) {
    const button = node('button', 'answer-option');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(state.answers[question.id] === choice.value));
    const marker = node('span', 'answer-choice-mark', season.id === 2 ? String.fromCharCode(65 + index) : String(index + 1));
    marker.setAttribute('aria-hidden', 'true');
    const label = node('span', 'answer-choice-text');
    const korean = node('span', 'answer-choice-ko', choice.ko);
    korean.lang = 'ko';
    const chinese = node('span', 'answer-choice-zh', choice.zh_cn);
    label.append(korean, chinese);
    button.append(marker, label);
    button.addEventListener('click', () => {
      state.answers[question.id] = choice.value;
      for (const sibling of container.children) sibling.setAttribute('aria-pressed', String(sibling === button));
      $('quiz-next').disabled = false;
    });
    container.append(button);
  }
  $('quiz-back').disabled = state.index === 0;
  $('quiz-next').disabled = state.answers[question.id] === undefined;
  $('quiz-next').firstChild.textContent = state.index === count - 1 ? '查看我的示例结果 ' : '确认，继续 ';
}

function renderResult() {
  const season = SEASONS[state.seasonId];
  state.result = scoreAnswers(season, state.answers);
  const root = $('result-content');
  root.replaceChildren();

  const overline = node('div', 'result-overline', `RESULT / SEASON 0${season.id} · INDEPENDENT DEMO`);
  const header = node('div', 'result-header');
  const intro = node('div');
  const title = node('h1', '', '你在这张价值地图上的坐标。');
  title.id = 'result-title';
  const subtitle = node('p', '', `${season.label} · ${season.description} 本页仅依据 ${season.questions.length} 道本站原创示例题计算，不是节目官方成绩或心理学诊断。`);
  intro.append(title, subtitle);
  const emblem = node('div', 'result-emblem', `0${season.id}`);
  emblem.append(node('small', '', 'YOUR POSITION'));
  header.append(intro, emblem);
  const grid = node('div', 'result-grid');
  const resultPanel = node('div', 'result-panel');
  const panelHeading = node('div', 'panel-heading');
  panelHeading.append(node('h2', '', '价值坐标'), node('span', '', '－100 → ＋100'));
  resultPanel.append(panelHeading);
  for (const axis of state.result.dimensions) {
    const item = node('div', 'axis-result');
    const top = node('div', 'axis-result-top');
    top.append(node('span', '', axis.name), node('strong', '', `${axis.score > 0 ? '+' : ''}${axis.score}`));
    const endpoints = node('div', 'axis-endpoints');
    endpoints.append(node('span', '', axis.negative), node('span', '', axis.positive));
    const track = node('div', 'axis-track');
    const pointer = node('span', 'axis-pointer');
    pointer.style.left = `${(axis.score + 100) / 2}%`;
    track.append(pointer);
    const interpretation = axis.score === 0 ? '本次两个方向大致平衡。' : `这组示例回答较偏向「${axis.score > 0 ? axis.positive : axis.negative}」。`;
    item.append(top, endpoints, track, node('p', 'axis-interpretation', `${interpretation} ${axis.explanation}`));
    resultPanel.append(item);
  }

  const guestPanel = node('aside', 'guest-panel');
  guestPanel.append(node('span', 'status-label', '需要真实且可比的数据'), node('h2', '', '与你最像的节目嘉宾？'),
    node('p', '', '这里是未来最重要的功能：同季嘉宾 Top 3–5、每个维度的差异、本人公开确认的 X／Instagram／YouTube 链接。现在使用原创示例题，不能与嘉宾在节目里的真实测量结果比较，所以暂不显示人名和虚构匹配率。'));
  const steps = node('div', 'guest-steps');
  for (const [index, label] of ['核验节目原题与重用权限', '复核韩中双语及官方计分', '验证同季嘉宾成绩与公开社媒'].entries()) {
    const step = node('div', 'guest-step');
    step.append(node('span', '', index + 1), node('div', '', label));
    steps.append(step);
  }
  guestPanel.append(steps);
  grid.append(resultPanel, guestPanel);
  const actions = node('div', 'result-actions');
  const restart = node('button', 'button button-primary', '重新测试 ↗');
  restart.type = 'button';
  restart.addEventListener('click', () => begin(season.id, true));
  const download = node('button', 'button button-outline', '下载本机结果 ↓');
  download.type = 'button';
  download.addEventListener('click', downloadResult);
  const home = node('button', 'button button-text', '选择另一季 →');
  home.type = 'button';
  home.addEventListener('click', showHome);
  actions.append(restart, download, home);
  const footnote = node('p', 'result-footnote', '隐私说明：所有答案只存在于当前页面的内存中，不会上传或写入浏览器持久存储；关闭或刷新后就会消失。下载结果时仅包含维度分数与版本信息，不含逐题答案。GitHub 登录与私人历史记录功能尚未启用。');
  root.append(overline, header, grid, actions, footnote);
  switchView('result');
}

function downloadResult() {
  if (!state.result) return;
  const content = JSON.stringify({ ...state.result, notice: '本站原创示例，不代表节目官方结果；请勿用于嘉宾匹配。' }, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `community-demo-season-${state.result.season}-result.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('hero-start').addEventListener('click', () => begin(2));
$('start-s2').addEventListener('click', () => begin(2));
$('start-s1').addEventListener('click', () => begin(1));
$('quiz-exit').addEventListener('click', showHome);
$('quiz-back').addEventListener('click', () => {
  if (state.index > 0) { state.index--; renderQuestion(); }
});
$('quiz-next').addEventListener('click', () => {
  const season = SEASONS[state.seasonId];
  if (state.answers[season.questions[state.index].id] === undefined) return;
  if (state.index < season.questions.length - 1) { state.index++; renderQuestion(); }
  else renderResult();
});
document.querySelectorAll('.brand,.header-links a[href^="#"]').forEach((link) => {
  link.addEventListener('click', () => {
    if (state.view !== 'home') showHome();
  });
});
