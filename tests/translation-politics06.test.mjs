import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractDraftPack } from '../lib/full-questionnaire.mjs';
import { loadFullQuestionnaire } from '../scripts/load-full-questionnaire.mjs';
import { verifyKoreanSourceSnapshot } from '../scripts/verify-korean-source-snapshot.mjs';

const paths = ['docs/translation-review/index.html', 'docs/original-question-translation-review/index.html'];
const expected = '高收费的校外教育培训应受到监管。';

test('S1 politics-06 AI draft does not narrow 사교육 to exam tutoring alone', () => {
  const rows = paths.map(path => {
    const draft = extractDraftPack(readFileSync(path, 'utf8'));
    const q = draft.questions.find(row => row.id === 's1-politics-06');
    assert.ok(q, path);
    assert.match(q.source_text_ko, /고액의 사교육/);
    assert.equal(q.translation_zh_cn, expected, path);
    assert.equal(q.translation_version, 'draft-0.1.1');
    assert.match(q.translator_note, /韩国教育部/);
    assert.match(q.translator_note, /待独立韩中人工复核/);
    assert.equal(q.review_status, 'draft');
    assert.equal(q.translation_status, 'AI_DRAFT_UNREVIEWED');
    assert.equal(q.scoring_version, 'UNKNOWN');
    assert.equal(draft.independent_bilingual_review, 'NOT_DONE');
    return q;
  });
  assert.deepEqual(rows[0], rows[1]);
  const pack = loadFullQuestionnaire();
  assert.equal(pack.seasons[1].find(q => q.id === 's1-politics-06')?.draftZh, expected);
  assert.equal(verifyKoreanSourceSnapshot(pack), true);
  assert.equal(pack.scoringVersion, 'UNKNOWN');
});
