import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractDraftPack, createPrivateProgressReceipt, restorePrivateProgressReceipt } from "../lib/full-questionnaire.mjs";
import { loadFullQuestionnaire, attachTranslationFingerprints } from "../scripts/load-full-questionnaire.mjs";
import { verifyKoreanSourceSnapshot } from "../scripts/verify-korean-source-snapshot.mjs";

const id = "s1-gender-07";
const revised = "在演员、诗人、记者等职业称谓前加上‘女’字（如‘女演员’‘女诗人’‘女记者’），是贬低女性价值的一种方式。";
const prior = "在“女演员”“女诗人”“女记者”等职业名称前加上性别标记，是贬低女性价值的方式之一。";

const paths = ["docs/translation-review/index.html", "docs/original-question-translation-review/index.html"];

test("S1 gender07 does not imply adding a second gender prefix to already gender-marked titles", () => {
  const rows = paths.map(path => {
    const page = extractDraftPack(readFileSync(path, "utf8"));
    const q = page.questions.find(row => row.id === id);
    assert.ok(q, path);
    assert.equal(q.translation_zh_cn, revised);
    assert.equal(q.translation_version, "draft-0.1.1");
    assert.match(q.source_text_ko, /‘여배우’.*‘여류시인’.*‘여기자’/);
    assert.match(q.translator_note, /重复添加/);
    assert.match(q.translator_note, /待独立韩中人工复核/);
    assert.equal(q.review_status, "draft");
    assert.equal(q.translation_status, "AI_DRAFT_UNREVIEWED");
    assert.equal(page.independent_bilingual_review, "NOT_DONE");
    assert.equal(q.rights_status, "user_reported_permission_unverified");
    return q;
  });
  assert.deepEqual(rows[0], rows[1]);
  const pack = loadFullQuestionnaire();
  const q = pack.seasons[1].find(item => item.id === id);
  assert.equal(q.draftZh, revised);
  assert.equal(pack.scoringVersion, "UNKNOWN");
  assert.equal(verifyKoreanSourceSnapshot(pack), true);
});

test("changed S1 gender07 copy cannot silently re-use an older local choice provenance", () => {
  const current = loadFullQuestionnaire();
  const old = structuredClone(current);
  const index = old.seasons[1].findIndex(q => q.id === id);
  old.seasons[1][index].draftZh = prior;
  old.seasons[1][index].translationVersion = "draft-0.1.0";
  attachTranslationFingerprints(old);
  const previousReceipt = createPrivateProgressReceipt(old, 1, { [id]: old.seasons[1][index].options[0].value }, index);
  const restored = restorePrivateProgressReceipt(current, previousReceipt);
  assert.deepEqual(restored.changedQuestionIds, [id]);
  assert.equal(restored.answers[id], old.seasons[1][index].options[0].value);
});
