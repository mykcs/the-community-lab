// Transport fixtures exercise client control flow only. RLS is tested separately
// by the canonical migration in real PostgreSQL with synthetic Auth identities.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SEASONS } from '../data/questions.mjs';
import { scoreAnswers } from '../lib/quiz.mjs';
import { HISTORY_CONSENT_VERSION, HISTORY_SELECT_COLUMNS, toHistoryPayload } from '../lib/history-contract.mjs';
import { createHistoryService } from '../lib/history-service.mjs';

function row(n = 1) {
  const season = SEASONS[2];
  const result = scoreAnswers(season, Object.fromEntries(season.questions.map(q => [q.id, q.options[0].value])));
  const uuid = `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  return { ...toHistoryPayload(result, { consent: true, requestId: uuid }), id: uuid,
    created_at: `2026-10-${String(20 - n).padStart(2, '0')}T00:00:00Z`, consented_at: '2026-10-01T00:00:00Z' };
}
function fixture(responses = [], caps = []) {
  const calls = [];
  let session = { access_token: 'synthetic-token-a', user: { id: 'synthetic-user-a' } };
  const defaultCap = { session_active: true, capture_enabled: true, consent_version: HISTORY_CONSENT_VERSION };
  class Query {
    constructor(table) { this.call = { table, method: 'select', filters: [] }; }
    select(columns) { this.call.columns = columns; return this; }
    order(column, options) { this.call.order ??= []; this.call.order.push([column, options]); return this; }
    limit(value) { this.call.limit = value; return this; }
    or(value) { this.call.cursor = value; return this; }
    eq(column, value) { this.call.filters.push([column, value]); return this; }
    insert(value) { this.call.method = 'insert'; this.call.payload = value; return this; }
    delete() { this.call.method = 'delete'; return this; }
    setHeader(name, value) { this.call.headers ??= {}; this.call.headers[name] = value; return this; }
    execute() { calls.push(this.call); assert.ok(responses.length, 'unexpected transport call'); const next = responses.shift(); return Promise.resolve(typeof next === 'function' ? next() : next); }
    single() { return this; }
    maybeSingle() { return this; }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
  }
  const client = {
    from: table => new Query(table),
    rpc: name => { assert.equal(name, 'history_capabilities'); return { setHeader() { return this; }, then(resolve) { return Promise.resolve({ data: caps.length ? caps.shift() : defaultCap, error: null }).then(resolve); } }; },
    auth: { getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: session.user }, error: null }),
      signOut: async options => { calls.push({ method: 'signOut', options }); return { error: null }; } },
  };
  return { client, calls, service: createHistoryService(client), setSession(value) { session = value; } };
}
const ok = data => ({ data, error: null });

test('client fixture exports through an empty terminal page even when provider caps pages below requested size', async () => {
  const f = fixture([ok([row(1), row(2)]), ok([row(3)]), ok([])]);
  const exported = await f.service.exportAll();
  assert.equal(exported.length, 3);
  assert.equal(f.calls.length, 3);
  assert.ok(f.calls.every(c => c.columns === HISTORY_SELECT_COLUMNS && !c.columns.split(',').includes('owner_id')));
  assert.match(f.calls[1].cursor, /created_at\.lt\./);
  for (const record of exported) for (const key of ['id', 'owner_id', 'client_request_id', 'answers', 'email']) assert.equal(Object.hasOwn(record, key), false);
});
test('client fixture refuses duplicate pagination instead of producing a silently incomplete export', async () => {
  const f = fixture([ok([row(1)]), ok([row(1)])]);
  await assert.rejects(f.service.exportAll(), { code: 'export_incomplete' });
});
test('client fixture does not treat RLS-hidden data after session revocation as a completed read or delete', async () => {
  const active = { session_active: true, capture_enabled: false, consent_version: null };
  const revoked = { ...active, session_active: false };
  const reading = fixture([ok([])], [active, revoked]);
  await assert.rejects(reading.service.listPage(), { code: 'signed_out' });
  const deleting = fixture([ok({ id: row().id }), ok(null), ok([])], [active, active, revoked]);
  await assert.rejects(deleting.service.deleteRun(row().id), { code: 'delete_unconfirmed' });
});
test('client fixture keeps cleanup available with capture off and confirms deletion with a fresh active-session read', async () => {
  const cap = { session_active: true, capture_enabled: false, consent_version: null };
  const f = fixture([ok({ id: row().id }), ok(null), ok([])], [cap, cap]);
  assert.deepEqual(await f.service.deleteRun(row().id), { deleted: true });
  assert.deepEqual(f.calls.map(c => c.method), ['select', 'delete', 'select']);
  const foreign = fixture([ok(null)], [cap]);
  await assert.rejects(foreign.service.deleteRun(row().id), { code: 'not_found' });
  assert.equal(foreign.calls.some(c => c.method === 'delete'), false);
});
test('client fixture refuses saves with closed capture and idempotently reads back only an identical prior request', async () => {
  const payload = Object.fromEntries(Object.entries(row()).filter(([key]) => !['id', 'created_at', 'consented_at'].includes(key)));
  const closed = fixture([], [{ session_active: true, capture_enabled: false, consent_version: HISTORY_CONSENT_VERSION }]);
  await assert.rejects(closed.service.save(payload), { code: 'capture_closed' });
  assert.equal(closed.calls.length, 0);
  const duplicate = fixture([{ data: null, error: { code: '23505', details: 'must not echo raw database details' } }, ok(row())]);
  assert.equal((await duplicate.service.save(payload)).id, row().id);
  const conflict = fixture([{ data: null, error: { code: '23505' } }, ok({ ...row(), dimensions: row().dimensions.map(x => ({ ...x, score: -x.score })) })]);
  await assert.rejects(conflict.service.save(payload), { code: 'save_failed' });
});
test('client fixture performs explicit local-session sign-out', async () => {
  const f = fixture(); await f.service.signOut();
  assert.deepEqual(f.calls, [{ method: 'signOut', options: { scope: 'local' } }]);
});

test('client fixture preserves microsecond cursor precision across a full page', async () => {
  const rows = Array.from({ length: 37 }, (_, index) => ({ ...row(1), id: row(37 - index).id,
    created_at: '2026-10-19T00:00:00.123456+00:00' }));
  const f = fixture([ok(rows.slice(0, 20)), ok(rows.slice(20)), ok([])]);
  assert.equal((await f.service.exportAll()).length, 37);
  assert.match(f.calls[1].cursor, /2026-10-19T00:00:00\.123456\+00:00/);
  assert.ok(f.calls.every(call => call.headers.Authorization === 'Bearer synthetic-token-a'));
});

test('client fixture discards export and deletion confirmation if the session changes in flight', async () => {
  const other = { access_token: 'synthetic-token-b', user: { id: 'synthetic-user-b' } };
  const reading = fixture([() => { reading.setSession(other); return ok([row(1)]); }]);
  await assert.rejects(reading.service.exportAll(), { code: 'signed_out' });
  assert.equal(reading.calls.length, 1);
  const deleting = fixture([ok({ id: row().id }), () => { deleting.setSession(other); return ok(null); }, ok([])]);
  await assert.rejects(deleting.service.deleteRun(row().id), { code: 'delete_unconfirmed' });
  assert.ok(deleting.calls.every(call => call.headers.Authorization === 'Bearer synthetic-token-a'));
});
