import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractDraftPack, createPrivateProgressReceipt, restorePrivateProgressReceipt,
} from '../lib/full-questionnaire.mjs';
import { attachTranslationFingerprints, loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { verifyKoreanSourceSnapshot } from '../scripts/verify-korean-source-snapshot.mjs';

const pages = [
  'docs/translation-review/index.html',
  'docs/original-question-translation-review/index.html',
];
const sourceKo = '중대한 공익을 침해하는 기업의 부정을 고발하면 무고한 많은 사람들이 일자리를 잃게 되더라도 고발해야 한다.';
const previousZh = '即使揭发严重损害公共利益的企业不法行为会导致许多无辜者失业，也仍应揭发。';
const currentZh = '即使揭发严重损害公共利益的企业不正当行为会导致许多无辜者失业，也仍应揭发。';

test('S2 rp13 public draft avoids presuming an established legal violation', () => {
  const rows = pages.map(path => {
    const draft = extractDraftPack(readFileSync(path, 'utf8'));
    const q = draft.questions.find(item => item.id === 'rp13');
    assert.ok(q, path);
    assert.equal(q.source_text_ko, sourceKo);
    assert.equal(q.translation_zh_cn, currentZh);
    assert.equal(q.translation_version, 'draft-0.1.1');
    assert.match(q.translator_note, /부정/);
    assert.match(q.translator_note, /不正当行为/);
    assert.match(q.translator_note, /独立韩中人工复核/);
    assert.equal(q.review_status, 'draft');
    assert.equal(q.translation_status, 'AI_DRAFT_UNREVIEWED');
    assert.equal(q.rights_status, 'user_reported_permission_unverified');
    assert.equal(q.scoring_version, 'UNKNOWN');
    assert.deepEqual(q.options.map(({ value, ko, zh_cn }) => [value, ko, zh_cn]), [
      ['O', '그렇다', '是'],
      ['X', '아니다', '不是'],
    ]);
    assert.equal(draft.independent_bilingual_review, 'NOT_DONE');
    return q;
  });
  assert.deepEqual(rows[0], rows[1], 'two public review copies must match');
  const pack = loadFullQuestionnaire();
  assert.equal(pack.seasons[2].find(q => q.id === 'rp13')?.draftZh, currentZh);
  assert.equal(verifyKoreanSourceSnapshot(pack), true);
  assert.equal(pack.scoringVersion, 'UNKNOWN');
});

test('S2 rp13 imported historic choice stays intact but requires fresh translation confirmation', () => {
  const currentPack = loadFullQuestionnaire();
  const oldPack = structuredClone(currentPack);
  const position = oldPack.seasons[2].findIndex(item => item.id === 'rp13');
  assert.ok(position >= 0);
  const oldQuestion = oldPack.seasons[2][position];
  oldQuestion.draftZh = previousZh;
  oldQuestion.translationVersion = 'draft-0.1.0';
  attachTranslationFingerprints(oldPack);
  const receipt = createPrivateProgressReceipt(oldPack, 2, { rp13: 'O' }, position);
  const imported = restorePrivateProgressReceipt(currentPack, receipt);
  assert.deepEqual(imported.changedQuestionIds, ['rp13']);
  assert.equal(imported.answers.rp13, 'O');
  assert.equal(imported.answerVersions.rp13, 'draft-0.1.0');
  assert.equal(imported.answerFingerprints.rp13, receipt.selections[0].translationFingerprint);
  assert.equal(imported.complete, false);
});
