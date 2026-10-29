import test from 'node:test';
import assert from 'node:assert/strict';
import { SEASONS } from '../data/questions.mjs';
import { createQuizSessions } from '../lib/quiz-session.mjs';
import { scoreAnswers } from '../lib/quiz.mjs';

test('interleaving the two seasons resumes each position and selected answer', () => {
  const sessions = createQuizSessions(SEASONS);
  const first = sessions.begin(1);
  first.answers[SEASONS[1].questions[0].id] = -2;
  first.index = 1;
  const second = sessions.begin(2);
  second.answers[SEASONS[2].questions[0].id] = 1;
  second.index = 1;
  assert.equal(sessions.begin(1), first);
  assert.equal(sessions.begin(1).index, 1);
  assert.deepEqual(sessions.begin(1).answers, { 's1-d01': -2 });
  assert.equal(sessions.begin(2), second);
  assert.equal(sessions.begin(2).index, 1);
  assert.deepEqual(sessions.begin(2).answers, { 's2-d01': 1 });
});

test('completed results remain available when the other season is opened', () => {
  const sessions = createQuizSessions(SEASONS);
  const first = sessions.begin(1);
  first.answers = Object.fromEntries(SEASONS[1].questions.map(q => [q.id, q.options[0].value]));
  first.result = scoreAnswers(SEASONS[1], first.answers);
  const result = structuredClone(first.result);
  sessions.begin(2);
  assert.deepEqual(sessions.begin(1).result, result);
});

test('retesting clears only the chosen season; a fresh page store retains neither season', () => {
  const sessions = createQuizSessions(SEASONS);
  const first = sessions.begin(1);
  first.index = 3;
  first.answers['s1-d01'] = -1;
  const second = sessions.begin(2);
  second.index = 2;
  second.answers['s2-d01'] = 1;
  const restarted = sessions.begin(2, true);
  assert.deepEqual(restarted, { seasonId: 2, index: 0, answers: {}, result: null });
  assert.equal(sessions.begin(1), first);
  assert.equal(first.index, 3);
  assert.equal(first.answers['s1-d01'], -1);
  assert.equal(createQuizSessions(SEASONS).get(1), null);
  assert.equal(createQuizSessions(SEASONS).get(2), null);
});

test('an unknown season cannot overwrite an existing session', () => {
  const sessions = createQuizSessions(SEASONS);
  const first = sessions.begin(1);
  assert.throws(() => sessions.begin(3), /未知季别/);
  assert.equal(sessions.get(1), first);
});
