import test from 'node:test';
import assert from 'node:assert/strict';
import { SEASONS } from '../data/questions.mjs';
import { validateSeason, scoreAnswers } from '../lib/quiz.mjs';

// Regression: choosing between two visually distinct answers must never
// map to the same persisted value; otherwise back navigation selects both.
test('reject duplicate option values rather than silently conflating answers', () => {
  const season = structuredClone(SEASONS[2]);
  season.questions[0].options[1].value = season.questions[0].options[0].value;
  assert.throws(() => validateSeason(season), /选项分值重复/);
});

test('reject one-sided or all-zero ranges in bipolar demo scoring', () => {
  const season = structuredClone(SEASONS[2]);
  season.questions[0].options[1].value = 2;
  assert.throws(() => validateSeason(season), /双极量表/);

  season.questions[0].options[0].value = 0;
  season.questions[0].options[1].value = 0;
  assert.throws(() => validateSeason(season), /选项分值重复/);
});

test('reject duplicate axis IDs and mixed or absent translation versions', () => {
  const season = structuredClone(SEASONS[1]);
  season.axes[1].id = season.axes[0].id;
  assert.throws(() => validateSeason(season), /重复或缺失维度编号/);

  const translated = structuredClone(SEASONS[1]);
  translated.questions[0].translation_version = 'demo-0.2.0';
  assert.throws(() => validateSeason(translated), /混用了不同译文版本/);
  translated.questions[0].translation_version = '';
  assert.throws(() => validateSeason(translated), /译文版本缺失/);
});

test('result version follows the validated question pack, not a hard-coded label', () => {
  const season = structuredClone(SEASONS[2]);
  for (const question of season.questions) question.translation_version = 'demo-0.2.0';
  const answers = Object.fromEntries(season.questions.map(q => [q.id, q.options[0].value]));
  const result = scoreAnswers(season, answers);
  assert.equal(result.translation_version, 'demo-0.2.0');
  assert.equal(result.question_version, season.version);
  assert.equal(result.scoring_version, season.scoringVersion);
});
