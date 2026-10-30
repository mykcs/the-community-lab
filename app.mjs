import { SEASONS } from './data/questions.mjs';
import { scoreAnswers, validateSeason } from './lib/quiz.mjs';
import { createQuizSessions } from './lib/quiz-session.mjs';
import { GUEST_SOCIAL_DIRECTORY } from './data/guest-social-directory.mjs';

for (const season of Object.values(SEASONS)) validateSeason(season);

// Only in-memory state: answers never leave this browser tab or enter URL/logs/storage.
const sessions = createQuizSessions(SEASONS);
const state = { view: 'home' };
let active = null;
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
  const heading = name === 'quiz' ? $('question-ko') : name === 'result' ? $('result-title') : $('hero-title');
  heading?.focus({ preventScroll: true });
}

function begin(seasonId, fresh = false) {
  if (!SEASONS[seasonId]) return;
  active = sessions.begin(seasonId, fresh);
  if (active.result) { renderResult(); return; }
  renderQuestion();
  switchView('quiz');
}

function showHome() {
  for (const id of [1, 2]) {
    const saved = sessions.get(id);
    const answered = saved ? Object.keys(saved.answers).length : 0;
    const action = saved?.result ? '查看' : answered ? '继续' : '开始';
    const label = id === 1 ? '第一季' : '第二季';
    const button = $('start-s' + id);
    button.firstChild.textContent = saved?.result ? '结果' : action;
    button.setAttribute('aria-label', `${action}${label}演示${saved?.result ? '结果' : '测试'}`);
    const note = $('s' + id + '-session-note');
    note.hidden = !answered;
    note.textContent = !answered ? '' : saved.result ? '本页已有你的示例结果，可随时查看。' : `已答 ${answered} / ${SEASONS[id].questions.length} 题 · 继续第 ${saved.index + 1} 题`;
    if (id === 2) $('hero-start').firstChild.textContent = `${action}第二季示例${saved?.result ? '结果' : '测试'} `;
  }
  switchView('home');
}

function updateProgress() {
  const count = SEASONS[active.seasonId].questions.length;
  const answered = Object.keys(active.answers).length;
  $('quiz-percent').textContent = `已答 ${answered} / ${count} 题`;
  $('quiz-progress').max = count;
  $('quiz-progress').value = answered;
}

function renderQuestion() {
  const season = SEASONS[active.seasonId];
  const question = season.questions[active.index];
  const axis = season.axes.find((entry) => entry.id === question.axis);
  const count = season.questions.length;
  const currentNumber = String(active.index + 1).padStart(2, '0');
  const totalNumber = String(count).padStart(2, '0');
  $('quiz-season-label').textContent = `SEASON ${String(season.id).padStart(2, '0')} / ORIGINAL DEMO`;
  $('quiz-count').textContent = `第 ${currentNumber} / ${totalNumber} 题`;
  updateProgress();
  $('quiz-axis-name').textContent = axis.name;
  $('question-ko').textContent = question.source_text_ko;
  $('question-zh').textContent = question.translation_zh_cn;
  $('answer-instruction').textContent = season.prompt;
  const container = $('answer-options');
  container.replaceChildren();
  for (const [index, choice] of question.options.entries()) {
    const button = node('button', 'answer-option');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(active.answers[question.id] === choice.value));
    const marker = node('span', 'answer-choice-mark', season.id === 2 ? String.fromCharCode(65 + index) : String(index + 1));
    marker.setAttribute('aria-hidden', 'true');
    const label = node('span', 'answer-choice-text');
    const korean = node('span', 'answer-choice-ko', choice.ko);
    korean.lang = 'ko';
    const chinese = node('span', 'answer-choice-zh', choice.zh_cn);
    label.append(korean, chinese);
    button.append(marker, label);
    button.addEventListener('click', () => {
      active.answers[question.id] = choice.value;
      for (const sibling of container.children) sibling.setAttribute('aria-pressed', String(sibling === button));
      $('quiz-next').disabled = false;
      updateProgress();
    });
    container.append(button);
  }
  $('quiz-back').disabled = active.index === 0;
  $('quiz-next').disabled = active.answers[question.id] === undefined;
  $('quiz-next').firstChild.textContent = active.index === count - 1 ? '查看我的示例结果 ' : '确认，继续 ';
  if (state.view === 'quiz') {
    window.scrollTo({ top: 0, behavior: 'instant' });
    $('question-ko').focus({ preventScroll: true });
  }
}

function renderResult() {
  const season = SEASONS[active.seasonId];
  active.result ??= scoreAnswers(season, active.answers);
  const root = $('result-content');
  root.replaceChildren();

  const overline = node('div', 'result-overline', `RESULT / SEASON 0${season.id} · INDEPENDENT DEMO`);
  const header = node('div', 'result-header');
  const intro = node('div');
  const title = node('h1', '', '你在这张价值地图上的坐标。');
  title.id = 'result-title';
  title.tabIndex = -1;
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
  for (const axis of active.result.dimensions) {
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
  guestPanel.append(node('span', 'status-label', '真实匹配尚未开放'), node('h2', '', '目前没有可比的嘉宾成绩'),
    node('p', '', '这次结果来自本站原创示例题，不能与节目嘉宾的真实成绩比较，所以不会显示相似度或排名。嘉宾公开主页目录已在首页开放；目录只供导航，成绩和匹配资格仍待核实。'));
  const steps = node('div', 'guest-steps');
  for (const [index, label] of ['核验节目原题与重用权限', '复核韩中双语及官方计分', '验证同季嘉宾成绩与公开社媒'].entries()) {
    const step = node('div', 'guest-step');
    step.append(node('span', '', index + 1), node('div', '', label));
    steps.append(step);
  }
  guestPanel.append(steps);
  const directoryHeading = node('h3', '', '嘉宾公开来源中的社媒链接');
  const directoryNote = node('p', '', '下列链接由两名独立 Agent 逐条核对公开原始来源；这不等于真人逐条复核或法律身份认证。Instagram 页面未能直接读取，仅核对公开来源中发布的链接。共同频道会明确标注。这里只供导航，不代表嘉宾成绩已核实；近期活跃度未知。');
  const guestDirectory = node('ul', 'guest-social-directory');
  for (const guest of GUEST_SOCIAL_DIRECTORY) {
    if (guest.season !== season.id) continue;
    const person = node('li', 'guest-social-person');
    person.append(node('strong', '', `${guest.stage_name_ko} · ${guest.accounts.some(account => account.relationship === 'co_hosted_channel') ? '节目共同频道' : '公开账号链接'}`));
    const links = node('div', 'guest-social-links');
    for (const account of guest.accounts) {
      const link = node('a', '', account.platform);
      link.href = account.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', `${guest.stage_name_ko} 的公开 ${account.platform} 账号链接（社媒目录）`);
      const evidence = node('a', 'guest-social-source', '来源 ↗');
      evidence.href = account.evidence_url; evidence.target = '_blank'; evidence.rel = 'noopener noreferrer';
      evidence.setAttribute('aria-label', `${guest.stage_name_ko} 的 ${account.platform} 链接核查来源`);
      links.append(link, evidence);
    }
    person.append(links, node('small', '', '核查：两名独立 Agent 的原始来源 · 2026-10-29 · 待真人复核'));
    guestDirectory.append(person);
  }
  guestPanel.append(directoryHeading, directoryNote, guestDirectory);
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
  if (!active.result) return;
  const content = JSON.stringify({ ...active.result, notice: '本站原创示例，不代表节目官方结果；请勿用于嘉宾匹配。' }, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `community-demo-season-${active.result.season}-result.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('hero-start').addEventListener('click', () => begin(2));
$('start-s2').addEventListener('click', () => begin(2));
$('start-s1').addEventListener('click', () => begin(1));
$('quiz-exit').addEventListener('click', showHome);
$('quiz-back').addEventListener('click', () => {
  if (active.index > 0) { active.index--; renderQuestion(); }
});
$('quiz-next').addEventListener('click', () => {
  const season = SEASONS[active.seasonId];
  if (active.answers[season.questions[active.index].id] === undefined) return;
  if (active.index < season.questions.length - 1) { active.index++; renderQuestion(); }
  else renderResult();
});
document.querySelectorAll('.brand,.header-links a[href^="#"]').forEach((link) => {
  link.addEventListener('click', () => {
    if (state.view !== 'home') showHome();
  });
});
