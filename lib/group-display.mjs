// Site-authored Chinese labels for S1's client-derived group categories.
// These are NOT verified official category names. Share this one display
// contract with the questionnaire and its private-answer wording fingerprint.
const S1_GROUP_ZH = Object.freeze({
  politics: '公共与政治',
  gender: '性别观念',
  openness: '开放与变化',
  class: '阶级与生活经历',
});

export function s1GroupDraftLabel(group) {
  return Object.hasOwn(S1_GROUP_ZH, group) ? S1_GROUP_ZH[group] : group;
}
