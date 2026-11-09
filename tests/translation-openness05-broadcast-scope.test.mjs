import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractDraftPack, createPrivateProgressReceipt, restorePrivateProgressReceipt } from '../lib/full-questionnaire.mjs';
import { loadFullQuestionnaire, attachTranslationFingerprints } from '../scripts/load-full-questionnaire.mjs';

const id = 's1-openness-05';
const oldZh = '电视节目中的手语翻译画面是保障聋人权利的理所当然措施，因此画面尺寸应比现在更大，并应在所有节目中提供。';
const newZh = '节目中的手语翻译画面是保障聋人权利的理所当然措施，因此画面尺寸应比现在更大，并应出现在所有播出的节目中。';

test('S1 sign-language broadcast AI draft does not limit 모든 방송 to television', () => {
  const paths = ['docs/translation-review/index.html', 'docs/original-question-translation-review/index.html'];
  const rows = paths.map(path => {
    const pack = extractDraftPack(readFileSync(path, 'utf8'));
    const question = pack.questions.find(q => q.id === id);
    assert.equal(pack.questions.length, 124);
    assert.equal(pack.independent_bilingual_review, 'NOT_DONE');
    assert.equal(question.source_text_ko,
      '방송의 수어해설화면은 농인의 권리를 위한 당연한 조치이므로 지금보다 더 큰 사이즈로, 모든 방송에 나와야 한다.');
    assert.equal(question.translation_zh_cn, newZh);
    assert.equal(question.translation_version, 'draft-0.1.3');
    assert.match(question.translator_note, /모든 방송/);
    assert.match(question.translator_note, /独立韩中人工复核/);
    assert.equal(question.review_status, 'draft');
    assert.equal(question.translation_status, 'AI_DRAFT_UNREVIEWED');
    assert.equal(question.scoring_version, 'UNKNOWN');
    assert.deepEqual(question.options.map(o => o.value), [1, 2, 3, 4, 5, 6]);
    return question;
  });
  assert.deepEqual(rows[0], rows[1]);
  assert.equal(loadFullQuestionnaire().seasons[1].find(q => q.id === id).draftZh, newZh);
});

test('S1 prior television-only wording retains raw answer but requires a new confirmation', () => {
  const current = loadFullQuestionnaire();
  const historical = structuredClone(current);
  const index = historical.seasons[1].findIndex(q => q.id === id);
  historical.seasons[1][index].draftZh = oldZh;
  historical.seasons[1][index].translationVersion = 'draft-0.1.2';
  attachTranslationFingerprints(historical);
  const value = historical.seasons[1][index].options[4].value;
  const previous = createPrivateProgressReceipt(historical, 1, { [id]: value }, index);
  const restored = restorePrivateProgressReceipt(current, previous);
  assert.equal(restored.answers[id], value);
  assert.deepEqual(restored.changedQuestionIds, [id]);
  assert.deepEqual(restored.unknownWordingQuestionIds, []);
  assert.equal(restored.answerVersions[id], 'draft-0.1.2');
});
