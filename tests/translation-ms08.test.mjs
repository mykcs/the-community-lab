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
const expected = "即使是有些腐败的政治人物，只要能增加我的资产，我也可以投票支持他。";

test("S2 ms08 keeps willingness-to-vote modal rather than predicting vote probability", () => {
  const rows = paths.map(path => {
    const draft = extractDraftPack(readFileSync(path, "utf8"));
    const q = draft.questions.find(item => item.id === "ms08");
    assert.ok(q, path);
    assert.equal(q.source_text_ko, "다소 부패한 정치인이더라도 내 자산을 증식시켜 준다면 투표할 수 있다.");
    assert.equal(q.translation_zh_cn, expected, path);
    assert.equal(q.translation_version, "draft-0.1.1", path);
    assert.match(q.translator_note, /투표할 수 있다/);
    assert.match(q.translator_note, /仍待独立韩中人工复核/);
    assert.equal(q.review_status, "draft");
    assert.equal(q.translation_status, "AI_DRAFT_UNREVIEWED");
    assert.equal(draft.independent_bilingual_review, "NOT_DONE");
    return q;
  });
  assert.deepEqual(rows[0], rows[1], "published reviewer drafts must be identical");
  const pack = loadFullQuestionnaire();
  assert.equal(pack.seasons[2].find(q => q.id === "ms08")?.draftZh, expected);
  assert.equal(verifyKoreanSourceSnapshot(pack), true);
  assert.equal(pack.scoringVersion, "UNKNOWN");
});
