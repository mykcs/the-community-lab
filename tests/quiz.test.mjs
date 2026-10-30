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

test('S1 demo translation preserves the original speed condition and versions the change', () => {
  const first = SEASONS[1];
  const second = SEASONS[2];
  const government = first.questions.find(q => q.id === 's1-d01');
  const corrected = first.questions.find(q => q.id === 's1-d08');
  assert.equal(government.source_text_ko, '중요한 사회 문제는 정부가 적극적으로 해결해야 한다.');
  assert.equal(government.translation_zh_cn, '面对重大的社会问题，政府应该积极解决。');
  assert.equal(corrected.source_text_ko, '사회가 빠르게 변할 때는 익숙한 방식을 지키는 편이 낫다.');
  assert.equal(corrected.translation_zh_cn, '当社会快速变化时，沿用熟悉的做法更好。');
  assert.equal(first.version, 'independent-s1-demo-0.1.2');
  assert.ok(first.questions.every(q => q.translation_version === 'demo-s1-0.1.2'));
  assert.equal(second.version, 'independent-s2-demo-0.1.0');
  assert.ok(second.questions.every(q => q.translation_version === 'demo-0.1.0'));
});

test('a demo result must never lose its questionnaire or scoring provenance version', () => {
  for (const season of Object.values(SEASONS)) {
    const answers = Object.fromEntries(season.questions.map(q => [q.id, q.options[0].value]));
    const validResult = scoreAnswers(season, answers);
    assert.equal(validResult.question_version, season.version);
    assert.equal(validResult.scoring_version, season.scoringVersion);
    for (const field of ['version', 'scoringVersion']) {
      for (const invalid of [undefined, null, '', '   ', 123]) {
        const malformed = structuredClone(season);
        malformed[field] = invalid;
        assert.throws(() => validateSeason(malformed), /题库或计分版本缺失/);
        assert.throws(() => scoreAnswers(malformed, answers), /题库或计分版本缺失/);
      }
    }
  }
});
