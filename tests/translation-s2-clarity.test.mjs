import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractDraftPack, createPrivateProgressReceipt, restorePrivateProgressReceipt,
} from '../lib/full-questionnaire.mjs';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { verifyKoreanSourceSnapshot } from '../scripts/verify-korean-source-snapshot.mjs';

const pages = [
  'docs/translation-review/index.html',
  'docs/original-question-translation-review/index.html',
];
const corrections = {
  sa05: {
    ko: '소득세와 재산세를 내며 모은 자산을 자식에게 물려줄 때 상속세를 다시 부과하는 것은 개인 자산을 과도하게 침해한다.',
    zh: '积累财产时已经缴纳所得税和财产税，传给子女时还要征收遗产税，这是对个人财产的过度侵害。',
    version: 'draft-0.1.2', oldVersion: 'draft-0.1.1',
    note: /先后关系/,
  },
  ms05: {
    ko: '내가 정말 싫어하는 종류의 사람이라면 나의 직업적 성과에 큰 도움이 되어도 사적으로 친밀한 관계를 갖지 않겠다.',
    zh: '如果对方是我非常讨厌的那类人，即使对我的工作成果很有帮助，我也不会在私下与其深交。',
    version: 'draft-0.1.2', oldVersion: 'draft-0.1.1',
    note: /亲密关系.*恋爱.*深交.*仍待独立韩中人工复核/,
  },
  ms07: {
    ko: '내 자식에게는 영리하게 돈 버는 법보다 양심에 따라 사는 법을 먼저 가르치겠다.',
    zh: '比起教我的孩子如何精明地赚钱，我会先教孩子如何凭良心生活。',
    version: 'draft-0.1.3', oldVersion: 'draft-0.1.2',
    note: /不限定孩子的数量/,
  },
};

test('S2 AI wording corrections keep the same Korean sources, O/X values and unpublished review status', () => {
  const drafts = pages.map(path => extractDraftPack(readFileSync(path, 'utf8')));
  for (const [id, expected] of Object.entries(corrections)) {
    const rows = drafts.map(draft => {
      const q = draft.questions.find(item => item.id === id);
      assert.ok(q, id);
      assert.equal(q.source_text_ko, expected.ko);
      assert.equal(q.translation_zh_cn, expected.zh);
      assert.equal(q.translation_version, expected.version);
      assert.match(q.translator_note, expected.note);
      assert.equal(q.translation_status, 'AI_DRAFT_UNREVIEWED');
      assert.equal(q.review_status, 'draft');
      assert.equal(q.rights_status, 'user_reported_permission_unverified');
      assert.equal(q.scoring_version, 'UNKNOWN');
      assert.deepEqual(q.options.map(option => option.value), ['O', 'X']);
      assert.equal(draft.independent_bilingual_review, 'NOT_DONE');
      return q;
    });
    assert.deepEqual(rows[0], rows[1], id + ': both reviewer pages must agree');
  }
  assert.doesNotMatch(corrections.ms07.zh, /他们|她们/);
  assert.match(corrections.ms07.zh, /我的孩子/);
  assert.match(corrections.ms07.zh, /先教/);
  assert.doesNotMatch(corrections.ms05.zh, /亲密关系/);
  assert.match(corrections.ms05.zh, /私下与其深交/);
  const pack = loadFullQuestionnaire();
  for (const [id, expected] of Object.entries(corrections)) {
    assert.equal(pack.seasons[2].find(q => q.id === id)?.draftZh, expected.zh);
  }
  assert.equal(pack.scoringVersion, 'UNKNOWN');
  assert.equal(verifyKoreanSourceSnapshot(pack), true);
});

test('S2 prior-version local answer records retain raw O/X and require confirmation after S2 corrections', () => {
  const pack = loadFullQuestionnaire();
  const questions = pack.seasons[2];
  for (const [id, expected] of Object.entries(corrections)) {
    const index = questions.findIndex(q => q.id === id);
    assert.ok(index >= 0);
    const now = createPrivateProgressReceipt(pack, 2, { [id]: 'O' }, index);
    const previous = {
      ...now,
      selections: now.selections.map(selection => ({
        ...selection, translationVersion: expected.oldVersion,
      })),
    };
    const restored = restorePrivateProgressReceipt(pack, previous);
    assert.deepEqual(restored.changedQuestionIds, [id]);
    assert.equal(restored.answers[id], 'O');
    assert.equal(restored.answerVersions[id], expected.oldVersion);
  }
});
