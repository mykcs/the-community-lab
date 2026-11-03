/**
 * Unreviewed reader guidance for the S1 six-step source scale.
 * The original Korean wording and numeric option value remain authoritative.
 * This pure presentation helper is shared by the browser AND the build-time
 * wording fingerprint so old local answers cannot silently bypass re-review.
 */
export function displayedOptionCopy(question, option) {
  if (question?.season === 1 && question.options?.length === 6 &&
      ((option.value === 2 && option.ko === '2점') ||
       (option.value === 5 && option.ko === '5점'))) {
    const side = option.value === 2 ? '反对侧' : '赞同侧';
    return {
      zh: `${side} · 第 ${option.value} 档`,
      hint: `中文直译：${option.zh}。方向是根据六级顺序的辅助说明，不是官网命名。`,
    };
  }
  return { zh: option.zh, hint: null };
}
