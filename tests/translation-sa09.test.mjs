import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractDraftPack } from '../lib/full-questionnaire.mjs';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { verifyKoreanSourceSnapshot } from '../scripts/verify-korean-source-snapshot.mjs';

const paths = [
  'docs/translation-review/index.html',
  'docs/original-question-translation-review/index.html',
];
const expected = '即使偏远乡村学生成绩较低，考虑到他们所处的教育条件较差，也有必要在升学选拔中给予加分。';

test('S2 sa09 AI draft preserves educational disadvantage without amplifying its tone', () => {
  const rows = paths.map(path => {
    const draft = extractDraftPack(readFileSync(path, 'utf8'));
    const q = draft.questions.find(item => item.id === 'sa09');
    assert.ok(q, path);
    assert.match(q.source_text_ko, /열악한 교육 환경/);
    assert.match(q.source_text_ko, /입시에서 가산점을 주는 제도/);
    assert.equal(q.translation_zh_cn, expected, path);
    assert.equal(q.translation_version, 'draft-0.1.2', path);
    assert.doesNotMatch(q.translation_zh_cn, /升学考试中|城市学生|转正/);
    assert.match(q.translator_note, /升学考试中.*升学选拔中/);
    assert.match(q.translator_note, /教育条件较差/);
    assert.match(q.translator_note, /仍待独立韩中人工复核/);
    assert.equal(q.review_status, 'draft');
    assert.equal(q.translation_status, 'AI_DRAFT_UNREVIEWED');
    assert.equal(draft.independent_bilingual_review, 'NOT_DONE');
    return q;
  });
  assert.deepEqual(rows[0], rows[1], 'public AI drafts must agree');
  const pack = loadFullQuestionnaire();
  assert.equal(pack.seasons[2].find(q => q.id === 'sa09')?.draftZh, expected);
  assert.equal(verifyKoreanSourceSnapshot(pack), true);
  assert.equal(pack.scoringVersion, 'UNKNOWN');
});
