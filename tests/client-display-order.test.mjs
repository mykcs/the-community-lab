import test from 'node:test';
import assert from 'node:assert/strict';
import SOURCE from '../data/original-question-index.json' with { type: 'json' };
import { reconstructedClientOrder, verifyClientDisplayOrder } from '../scripts/verify-client-display-order.mjs';

test('pinned client fixed-seed permutation independently explains all 87 + 37 displayed positions', () => {
  assert.equal(verifyClientDisplayOrder(SOURCE), true);
  const first = [reconstructedClientOrder(SOURCE.questions, 1), reconstructedClientOrder(SOURCE.questions, 2)];
  assert.deepEqual(first.map(rows => [rows.length, rows[0], rows.at(-1)]), [
    [87, 's1-class-15', 's1-gender-13'],
    [37, 'ms10', 'rp03'],
  ]);
  // Do not infer stable cross-version order from this pinned-client observation.
});

test('an incorrect but complete permutation cannot pass the independent display-order audit', () => {
  const wrong = structuredClone(SOURCE);
  const a = wrong.questions.find(q => q.season === 2 && q.displayPositionDerivedFromClient === 1);
  const b = wrong.questions.find(q => q.season === 2 && q.displayPositionDerivedFromClient === 2);
  [a.displayPositionDerivedFromClient, b.displayPositionDerivedFromClient] =
    [b.displayPositionDerivedFromClient, a.displayPositionDerivedFromClient];
  assert.deepEqual(
    wrong.questions.filter(q => q.season === 2).map(q => q.displayPositionDerivedFromClient).sort((a,b) => a-b),
    Array.from({ length: 37 }, (_, i) => i + 1),
  );
  assert.throws(() => verifyClientDisplayOrder(wrong), /展示位置/);
});

test('one source-order swap is detected even if display positions remain a complete permutation', () => {
  const wrong = structuredClone(SOURCE);
  const a = wrong.questions.find(q => q.season === 1 && q.sourceArrayPosition === 1);
  const b = wrong.questions.find(q => q.season === 1 && q.sourceArrayPosition === 2);
  [a.sourceArrayPosition, b.sourceArrayPosition] = [b.sourceArrayPosition, a.sourceArrayPosition];
  assert.throws(() => verifyClientDisplayOrder(wrong), /展示位置/);
});

test('invalid source positions and invented question identities fail closed', () => {
  const wrong = structuredClone(SOURCE);
  wrong.questions.find(q => q.season === 2).sourceArrayPosition = 0;
  assert.throws(() => verifyClientDisplayOrder(wrong), /源题顺序/);
  const duplicate = structuredClone(SOURCE);
  duplicate.questions[1].sourceQuestionId = duplicate.questions[0].sourceQuestionId;
  assert.throws(() => verifyClientDisplayOrder(duplicate), /源题顺序/);
});
