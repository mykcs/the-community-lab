import test from 'node:test';
import assert from 'node:assert/strict';
import { SEASONS } from '../data/questions.mjs';
import { scoreAnswers } from '../lib/quiz.mjs';
import { toHistoryPayload } from '../lib/history-contract.mjs';
import { PENDING_HISTORY_KEY, PENDING_HISTORY_TTL_MS, writePendingHistory, readPendingHistory, clearPendingHistory } from '../lib/history-handoff.mjs';

const result = scoreAnswers(SEASONS[2], Object.fromEntries(SEASONS[2].questions.map(q => [q.id, q.options[0].value])));
const payload = toHistoryPayload(result, { consent: true, requestId: '10000000-0000-4000-8000-000000000001' });
function storage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
test('OAuth handoff stores nothing until explicit consent and keeps only the minimal validated payload', () => {
  const saved = storage();
  assert.throws(() => writePendingHistory(saved, payload), /明确同意/);
  assert.equal(saved.values.size, 0);
  writePendingHistory(saved, payload, { consent: true, now: 1000 });
  const pending = readPendingHistory(saved, 1001);
  assert.deepEqual(pending.payload, payload);
  assert.equal(Object.hasOwn(pending.payload, 'answers'), false);
  assert.equal(Object.hasOwn(pending.payload, 'owner_id'), false);
  assert.equal(pending.expiresAt - pending.createdAt, PENDING_HISTORY_TTL_MS);
});
test('expired, tampered, future or malformed handoffs are removed without touching unrelated session state', () => {
  for (const mutate of [
    p => { p.expiresAt += 1; },
    p => { p.createdAt += 10_000; p.expiresAt += 10_000; },
    p => { p.payload.answers = ['must not persist']; },
    p => { p.extra = 'unapproved field'; },
  ]) {
    const saved = storage(); saved.setItem('unrelated', 'keep');
    writePendingHistory(saved, payload, { consent: true, now: 1000 });
    const pending = JSON.parse(saved.getItem(PENDING_HISTORY_KEY)); mutate(pending);
    saved.setItem(PENDING_HISTORY_KEY, JSON.stringify(pending));
    assert.equal(readPendingHistory(saved, 1001), null);
    assert.equal(saved.getItem(PENDING_HISTORY_KEY), null);
    assert.equal(saved.getItem('unrelated'), 'keep');
  }
  const saved = storage(); writePendingHistory(saved, payload, { consent: true, now: 1000 });
  assert.equal(readPendingHistory(saved, 1000 + PENDING_HISTORY_TTL_MS), null);
  saved.setItem(PENDING_HISTORY_KEY, '{bad json');
  assert.equal(readPendingHistory(saved, 1001), null);
});
test('success/cancel cleanup removes this handoff only; unavailable storage never becomes a false saved result', () => {
  const saved = storage(); saved.setItem('unrelated', 'keep');
  writePendingHistory(saved, payload, { consent: true, now: 1000 }); clearPendingHistory(saved);
  assert.equal(saved.getItem(PENDING_HISTORY_KEY), null);
  assert.equal(saved.getItem('unrelated'), 'keep');
  assert.throws(() => writePendingHistory({ setItem() { throw new Error('blocked'); } }, payload, { consent: true, now: 1000 }), /无法暂存/);
});
