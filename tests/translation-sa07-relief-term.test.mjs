import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractDraftPack,
  createPrivateProgressReceipt,
  restorePrivateProgressReceipt,
} from '../lib/full-questionnaire.mjs';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { verifyKoreanSourceSnapshot } from '../scripts/verify-korean-source-snapshot.mjs';

const pages = [
  'docs/translation-review/index.html',
  'docs/original-question-translation-review/index.html',
];
const originalKo = '같은 비용이라면 경쟁에서 뒤처진 사람을 구제하는 것보다 뛰어난 인재를 육성하는 데 쓰는 편이 더 가치 있다.';
const revisedZh = '成本相同时，把资源用于培养优秀人才，比用于扶助在竞争中落后的人更有价值。';

test('S2 sa07 AI draft preserves the relief sense of 구제하다 without claiming human review', () => {
  const rows = pages.map(path => {
    const draft = extractDraftPack(readFileSync(path, 'utf8'));
    const q = draft.questions.find(item => item.id === 'sa07');
    assert.ok(q);
    assert.equal(q.source_text_ko, originalKo);
    assert.equal(q.translation_zh_cn, revisedZh);
    assert.equal(q.translation_version, 'draft-0.1.2');
    assert.match(q.translator_note, /国立国语院/);
    assert.match(q.translator_note, /구제하다/);
    assert.match(q.translator_note, /扶助/);
    assert.match(q.translator_note, /独立韩中人工复核/);
    assert.equal(q.review_status, 'draft');
    assert.equal(q.translation_status, 'AI_DRAFT_UNREVIEWED');
    assert.equal(q.rights_status, 'user_reported_permission_unverified');
    assert.equal(q.scoring_version, 'UNKNOWN');
    assert.deepEqual(q.options.map(option => [option.value, option.ko, option.zh_cn]), [
      ['O', '그렇다', '是'],
      ['X', '아니다', '不是'],
    ]);
    return q;
  });

  assert.deepEqual(rows[0], rows[1], 'both public review pages must agree');
  const pack = loadFullQuestionnaire();
  assert.equal(pack.seasons[2].find(q => q.id === 'sa07')?.draftZh, revisedZh);
  assert.equal(verifyKoreanSourceSnapshot(pack), true);
  assert.equal(pack.scoringVersion, 'UNKNOWN');
});

test('sa07 old local answers keep their raw choice and require reconfirmation', () => {
  const pack = loadFullQuestionnaire();
  const index = pack.seasons[2].findIndex(q => q.id === 'sa07');
  assert.ok(index >= 0);
  const old = createPrivateProgressReceipt(pack, 2, { sa07: 'O' }, index);
  old.selections[0].translationVersion = 'draft-0.1.1';
  const restored = restorePrivateProgressReceipt(pack, old);
  assert.deepEqual(restored.changedQuestionIds, ['sa07']);
  assert.equal(restored.answers.sa07, 'O');
});
