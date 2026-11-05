import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractDraftPack } from "../lib/full-questionnaire.mjs";
import { loadFullQuestionnaire } from "../scripts/load-full-questionnaire.mjs";
import { verifyKoreanSourceSnapshot } from "../scripts/verify-korean-source-snapshot.mjs";

const paths = [
  "docs/translation-review/index.html",
  "docs/original-question-translation-review/index.html",
];
const expected = "即使商品性价比很高，如果企业存在道德问题，我也不能购买。";

test("S2 ms01 AI draft keeps Korean inability modal rather than a promise not to buy", () => {
  const rows = paths.map(path => {
    const draft = extractDraftPack(readFileSync(path, "utf8"));
    const question = draft.questions.find(q => q.id === "ms01");
    assert.ok(question, path);
    assert.equal(question.source_text_ko, "상품의 가성비가 훌륭하더라도 윤리적으로 문제가 있는 기업이라면 구매할 수 없다.");
    assert.equal(question.translation_zh_cn, expected, path);
    assert.equal(question.translation_version, "draft-0.1.1", path);
    assert.match(question.translator_note, /구매할 수 없다/);
    assert.match(question.translator_note, /仍待独立韩中人工复核/);
    assert.equal(question.translation_status, "AI_DRAFT_UNREVIEWED");
    assert.equal(question.review_status, "draft");
    assert.equal(question.scoring_version, "UNKNOWN");
    assert.equal(draft.independent_bilingual_review, "NOT_DONE");
    return question;
  });
  assert.deepEqual(rows[0], rows[1], "both reviewer drafts must stay identical");
  const pack = loadFullQuestionnaire();
  assert.equal(pack.seasons[2].find(q => q.id === "ms01")?.draftZh, expected);
  assert.equal(verifyKoreanSourceSnapshot(pack), true);
  assert.equal(pack.scoringVersion, "UNKNOWN");
});
