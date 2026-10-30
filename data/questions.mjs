// Entirely original example prompts authored for this independent, non-official UX demo.
// These are NOT quotes from, or equivalent to, the TV show's questionnaires.
const meta = Object.freeze({
  origin: 'independent_demo',
  rights_status: 'original_demo',
  review_status: 'draft',
  translation_version: 'demo-0.1.0',
  source_url: null,
  source_checked_at: null,
});

function prompt(id, axis, ko, zh, options, polarity = 1) {
  return { ...meta, id, axis, source_text_ko: ko, translation_zh_cn: zh,
    options, polarity, translator_note: null };
}

// Version S1 wording changes separately so S2's verified demo wording stays stable.
const seasonOnePrompt = (...args) => ({ ...prompt(...args), translation_version: 'demo-s1-0.1.1' });

const pair = (leftKo, leftZh, rightKo, rightZh) => [
  { ko: leftKo, zh_cn: leftZh, value: 1 },
  { ko: rightKo, zh_cn: rightZh, value: -1 },
];

const agreement = [
  { ko: '전혀 동의하지 않는다', zh_cn: '完全不同意', value: -2 },
  { ko: '별로 동의하지 않는다', zh_cn: '不太同意', value: -1 },
  { ko: '대체로 동의한다', zh_cn: '比较同意', value: 1 },
  { ko: '매우 동의한다', zh_cn: '非常同意', value: 2 },
];

export const SEASONS = Object.freeze({
  2: {
    id: 2,
    version: 'independent-s2-demo-0.1.0',
    scoringVersion: 'independent-binary-v1',
    label: '第二季 · 看不见的手',
    description: '三个维度并不表示好坏，只代表此组原创情境下的取舍。',
    prompt: '在两个选项中，选择你此刻更倾向的一项。',
    axes: [
      { id: 'principle', name: '原则 / 结果', ko: '원칙 / 결과', negative: '更看重结果', positive: '更看重原则', explanation: '面对规则与即时效果之间的冲突，你会先顾及什么？' },
      { id: 'structure', name: '结构 / 能力', ko: '구조 / 능력', negative: '更看重个人能力', positive: '更看重制度结构', explanation: '解释一件事的成败时，你会先看环境与制度，还是个体能力？' },
      { id: 'meaning', name: '意义 / 实利', ko: '의미 / 실리', negative: '更看重实际收益', positive: '更看重共同意义', explanation: '做决定时，你更看重背后的价值意义，还是可见的实际效益？' },
    ],
    questions: [
      prompt('s2-d01','principle', '원칙을 지키는 일이 당장의 성과보다 중요하다.', '坚守原则，比取得眼前的成果更重要。', pair('원칙을 지킨다','坚持原则','당장의 성과를 택한다','优先取得眼前成效')),
      prompt('s2-d02','structure', '사회적 불평등의 원인을 살펴볼 때, 무엇을 먼저 보아야 할까?', '分析社会不平等的成因时，应该先关注什么？', pair('제도와 환경','制度与环境','개인의 선택과 노력','个人选择与努力')),
      prompt('s2-d03','meaning', '한정된 자원을 써야 한다면, 무엇을 우선하겠는가?', '如果必须使用有限的资源，你会优先考虑什么？', pair('함께 지키려는 가치','大家共同守护的价值','실제로 얻을 수 있는 이익','能够实际获得的收益')),
      prompt('s2-d04','principle', '규칙을 어겨야만 더 많은 사람을 도울 수 있다면, 당신은 무엇을 선택하겠는가?', '如果只有打破规则才能帮助更多人，你会如何选择？', pair('규칙을 지킨다','遵守规则','더 많은 사람을 돕는다','帮助更多人')),
      prompt('s2-d05','structure', '팀이 실패했을 때, 무엇을 먼저 살펴야 할까?', '团队失败时，首先应该审视什么？', pair('일하는 방식과 구조','工作方式与组织结构','구성원 각자의 역량','每位成员的个人能力')),
      prompt('s2-d06','meaning', '어떤 선택의 가치를 판단할 때, 무엇이 더 중요한가?', '评估一个选择的价值时，什么更重要？', pair('그 선택이 지닌 의미','这个选择承载的意义','그 선택이 낳는 실익','这个选择带来的实际利益')),
    ],
  },
  1: {
    id: 1,
    version: 'independent-s1-demo-0.1.1',
    scoringVersion: 'independent-fourpoint-v1',
    label: '第一季 · 价值观探索',
    description: '四个独立维度来自本站原创演示模型，不可直接套用到节目嘉宾。',
    prompt: '从四个程度中，选择你对这句话的看法。',
    axes: [
      { id: 'politics', name: '公共介入 / 个人自主', ko: '공공 개입 / 개인 자율', negative: '更倾向个人自主', positive: '更倾向公共介入', explanation: '处理重大社会议题时，如何看待公共部门与个人选择的关系？' },
      { id: 'gender', name: '机会平等 / 传统性别角色', ko: '기회 평등 / 전통적 역할', negative: '更倾向传统性别角色', positive: '更倾向机会平等', explanation: '你更强调性别平等的机会，还是传统角色的延续？' },
      { id: 'class', name: '缩小差距 / 按成就分配', ko: '격차 완화 / 성취 기반 분배', negative: '更倾向按成就分配', positive: '更倾向缩小差距', explanation: '如何权衡减少经济差距与按个人成就分配资源？' },
      { id: 'openness', name: '接纳变化 / 维持惯例', ko: '변화 수용 / 관행 유지', negative: '更倾向维持惯例', positive: '更倾向接纳变化', explanation: '面对新观念和快速变化的社会，你倾向开放尝试还是沿用习惯？' },
    ],
    questions: [
      seasonOnePrompt('s1-d01','politics', '중요한 사회 문제는 정부가 적극적으로 해결해야 한다.', '面对重大的社会问题，政府应该积极介入解决。', agreement),
      seasonOnePrompt('s1-d02','gender', '성별과 관계없이 누구나 동등한 기회를 누려야 한다.', '无论性别，每个人都应享有平等的机会。', agreement),
      seasonOnePrompt('s1-d03','class', '부의 격차를 줄이기 위한 공공 정책이 필요하다.', '为了缩小贫富差距，有必要采取公共政策。', agreement),
      seasonOnePrompt('s1-d04','openness', '익숙하지 않은 생각도 먼저 들어 볼 가치가 있다.', '即使是陌生的观点，也值得先听一听。', agreement),
      seasonOnePrompt('s1-d05','politics', '개인의 선택은 국가의 간섭 없이 최대한 존중받아야 한다.', '个人选择应尽可能不受国家干预，并得到尊重。', agreement, -1),
      seasonOnePrompt('s1-d06','gender', '전통적인 성 역할은 사회를 안정시키는 데 필요하다.', '传统性别角色对于维持社会稳定是必要的。', agreement, -1),
      seasonOnePrompt('s1-d07','class', '경제적 보상은 개인의 성취에 따라 달라져야 한다.', '经济回报应根据个人成就有所不同。', agreement, -1),
      seasonOnePrompt('s1-d08','openness', '사회가 빠르게 변할 때는 익숙한 방식을 지키는 편이 낫다.', '当社会快速变化时，沿用熟悉的做法更好。', agreement, -1),
    ],
  },
});
