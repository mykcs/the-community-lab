export function validateSeason(season) {
  if (!season || ![1, 2].includes(season.id) || !Array.isArray(season.axes) || !Array.isArray(season.questions)) {
    throw new Error('不合法的测试数据');
  }
  const axisIds = new Set(season.axes.map((axis) => axis.id));
  const questionIds = new Set();
  for (const q of season.questions) {
    if (questionIds.has(q.id) || !axisIds.has(q.axis)) throw new Error(`重复题号或未知维度：${q.id}`);
    questionIds.add(q.id);
    if (q.origin !== 'independent_demo' || q.rights_status !== 'original_demo') {
      throw new Error(`此演示程序拒绝未经许可的原版题目：${q.id}`);
    }
    if (!q.source_text_ko?.trim() || !q.translation_zh_cn?.trim() || q.translation_version === undefined) {
      throw new Error(`双语题干缺失：${q.id}`);
    }
    if (![1, -1].includes(q.polarity) || !Array.isArray(q.options) || q.options.length < 2) {
      throw new Error(`选项或计分配置错误：${q.id}`);
    }
    for (const option of q.options) {
      if (!option.ko?.trim() || !option.zh_cn?.trim() || !Number.isFinite(option.value)) {
        throw new Error(`选项的韩中译文或权重缺失：${q.id}`);
      }
    }
  }
  if (season.questions.length === 0) throw new Error('空题库');
  for (const axis of season.axes) {
    if (!season.questions.some((q) => q.axis === axis.id)) throw new Error(`维度缺少题目：${axis.id}`);
  }
  return true;
}

export function scoreAnswers(season, answers) {
  validateSeason(season);
  const dimensions = season.axes.map((axis) => {
    const questions = season.questions.filter((q) => q.axis === axis.id);
    const normalized = questions.map((q) => {
      if (!Object.prototype.hasOwnProperty.call(answers, q.id)) throw new Error(`缺少答案：${q.id}`);
      const option = q.options.find((candidate) => candidate.value === answers[q.id]);
      if (!option) throw new Error(`非法答案：${q.id}`);
      const maxAbs = Math.max(...q.options.map((item) => Math.abs(item.value)));
      return q.polarity * option.value / maxAbs;
    });
    const score = Math.round((normalized.reduce((sum, v) => sum + v, 0) / normalized.length) * 100);
    return { id: axis.id, name: axis.name, ko: axis.ko, negative: axis.negative,
      positive: axis.positive, explanation: axis.explanation, score, count: questions.length };
  });
  return { season: season.id, question_version: season.version, scoring_version: season.scoringVersion,
    translation_version: 'demo-0.1.0', origin: 'independent_demo', dimensions };
}
