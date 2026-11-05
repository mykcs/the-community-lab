/**
 * Unreviewed reader guidance for the S1 six-step source scale.
 * The original Korean wording and numeric option value remain authoritative.
 * This pure presentation helper is shared by the browser AND the build-time
 * wording fingerprint so old local answers cannot silently bypass re-review.
 */
export function displayedOptionCopy(question, option) {
  if (question?.season === 1 && question.options?.length === 6 &&
      (option.value === 2 || option.value === 5) && option.ko === '') {
    const side = option.value === 2 ? '反对侧' : '赞同侧';
    return {
      // The frozen source client has no Korean label at steps 2 and 5.
      // Earlier audit drafts invented 2점/5점: these are NOT source text.
      koreanLabel: null,
      zh: `${side} · 第 ${option.value} 档`,
      hint: `当前冻结客户端此档没有韩文文字标签；旧 AI 草稿中的“${option.value}점”仅是本站按档位填写的占位，不是官网原文。原中文初译为“${option.zh}”；方向是本站根据六级顺序的辅助说明，不是官网命名。`,
    };
  }
  return { koreanLabel: option.ko, zh: option.zh, hint: null };
}
