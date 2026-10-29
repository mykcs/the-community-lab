export function validateSeason(season) {
  if (!season || ![1, 2].includes(season.id) || !Array.isArray(season.axes) || !Array.isArray(season.questions)) {
    throw new Error('不合法的测试数据');
  }
  const axisIds = new Set(season.axes.map((axis) => axis.id));
  if (axisIds.size !== season.axes.length || axisIds.size === 0 || axisIds.has(undefined)) {
    throw new Error('重复或缺失维度编号');
  }
  const questionIds = new Set();
  const translationVersions = new Set();
  for (const q of season.questions) {
    if (questionIds.has(q.id) || !axisIds.has(q.axis) || typeof q.id !== 'string' || !q.id.trim()) {
      throw new Error(`重复题号或未知维度：${q.id}`);
    }
    questionIds.add(q.id);
    if (q.origin !== 'independent_demo' || q.rights_status !== 'original_demo') {
      throw new Error(`此演示程序拒绝未经许可的原版题目：${q.id}`);
    }
    if (!q.source_text_ko?.trim() || !q.translation_zh_cn?.trim() ||
        typeof q.translation_version !== 'string' || !q.translation_version.trim()) {
      throw new Error(`双语题干或译文版本缺失：${q.id}`);
    }
    translationVersions.add(q.translation_version);
    if (![1, -1].includes(q.polarity) || !Array.isArray(q.options) || q.options.length < 2) {
      throw new Error(`选项或计分配置错误：${q.id}`);
    }
    const values = new Set();
    let positive = false;
    let negative = false;
    for (const option of q.options) {
      if (!option.ko?.trim() || !option.zh_cn?.trim() || !Number.isFinite(option.value)) {
        throw new Error(`选项的韩中译文或权重缺失：${q.id}`);
      }
      if (values.has(option.value)) {
        throw new Error(`同一题的选项分值重复，无法区分答案：${q.id}`);
      }
      values.add(option.value);
      positive ||= option.value > 0;
      negative ||= option.value < 0;
    }
    if (!positive || !negative) {
      throw new Error(`双极量表必须有正负两个方向：${q.id}`);
    }
  }
  if (season.questions.length === 0) throw new Error('空题库');
  if (translationVersions.size !== 1) throw new Error('同季题库混用了不同译文版本');
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
    translation_version: season.questions[0].translation_version, origin: 'independent_demo', dimensions };
}
