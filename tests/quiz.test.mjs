import test from 'node:test';
import assert from 'node:assert/strict';
import { SEASONS } from '../data/questions.mjs';
import { scoreAnswers, validateSeason } from '../lib/quiz.mjs';

test('both seasons have unique bilingual prompts and bilingual answer options', () => {
  for (const season of Object.values(SEASONS)) {
    assert.equal(validateSeason(season), true);
    assert.equal(season.questions.length, season.id === 2 ? 6 : 8);
    for (const q of season.questions) {
      assert.match(q.source_text_ko, /[가-힣]/);
      assert.match(q.translation_zh_cn, /[\u4e00-\u9fff]/);
      assert.equal(q.review_status, 'draft');
      assert.equal(q.rights_status, 'original_demo');
      for (const option of q.options) {
        assert.match(option.ko, /[가-힣]/);
        assert.match(option.zh_cn, /[\u4e00-\u9fff]/);
      }
    }
  }
});

test('season 2 computes independent axes with symmetric binary extremes', () => {
  const season = SEASONS[2];
  const positive = Object.fromEntries(season.questions.map(q => [q.id, 1]));
  const result = scoreAnswers(season, positive);
  assert.deepEqual(result.dimensions.map(d => d.score), [100, 100, 100]);
  assert.equal(result.season, 2);
  assert.equal(result.origin, 'independent_demo');
  const negative = Object.fromEntries(season.questions.map(q => [q.id, -1]));
  assert.deepEqual(scoreAnswers(season, negative).dimensions.map(d => d.score), [-100, -100, -100]);
});

test('season 1 reverses reverse-keyed items without crossing dimensions', () => {
  const season = SEASONS[1];
  const neutral = Object.fromEntries(season.questions.map(q => [q.id, 2]));
  assert.deepEqual(scoreAnswers(season, neutral).dimensions.map(d => d.score), [0, 0, 0, 0]);
  // The positive first item and the reverse-worded second item align here.
  neutral['s1-d05'] = -2;
  assert.equal(scoreAnswers(season, neutral).dimensions[0].score, 100);
  assert.deepEqual(scoreAnswers(season, neutral).dimensions.slice(1).map(d => d.score), [0, 0, 0]);
});

test('missing and invalid answers are rejected', () => {
  const season = SEASONS[2];
  assert.throws(() => scoreAnswers(season, {}), /缺少答案/);
  const answers = Object.fromEntries(season.questions.map(q => [q.id, 1]));
  answers['s2-d01'] = 10;
  assert.throws(() => scoreAnswers(season, answers), /非法答案/);
});

test('scoring rejects cross-season, obsolete and inherited answer contamination', () => {
  for (const season of Object.values(SEASONS)) {
    const valid = Object.fromEntries(season.questions.map(q => [q.id, q.options[0].value]));
    const other = SEASONS[season.id === 1 ? 2 : 1].questions[0].id;
    assert.throws(() => scoreAnswers(season, { ...valid, [other]: 1 }),
      /其他季别或未知题号/);
    assert.throws(() => scoreAnswers(season, { ...valid, 'obsolete-question': 1 }),
      /其他季别或未知题号/);
    assert.throws(() => scoreAnswers(season, Object.assign(
      Object.create({ inherited: true }), valid)), /答案集合必须是纯对象/);
    assert.throws(() => scoreAnswers(season, null), /答案集合必须是纯对象/);
    assert.throws(() => scoreAnswers(season, []), /答案集合必须是纯对象/);
    const symbolAnswer = { ...valid, [Symbol('unexpected')]: 1 };
    assert.throws(() => scoreAnswers(season, symbolAnswer), /其他季别或未知题号/);
    assert.deepEqual(scoreAnswers(season, Object.assign(Object.create(null), valid)),
      scoreAnswers(season, valid), 'null-prototype answer maps remain valid');
  }
});

test('official content cannot be silently smuggled into the demo', () => {
  const draft = structuredClone(SEASONS[2]);
  draft.questions[0].origin = 'official';
  assert.throws(() => validateSeason(draft), /未经许可/);
});

test('duplicate IDs and option translation gaps are rejected', () => {
  const duplicated = structuredClone(SEASONS[2]);
  duplicated.questions[1].id = duplicated.questions[0].id;
  assert.throws(() => validateSeason(duplicated), /重复题号/);
  const missing = structuredClone(SEASONS[1]);
  missing.questions[0].options[0].zh_cn = '';
  assert.throws(() => validateSeason(missing), /译文或权重缺失/);
});
