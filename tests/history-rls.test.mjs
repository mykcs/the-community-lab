import test from 'node:test';
import assert from 'node:assert/strict';
import { HISTORY_CONSENT_VERSION, HISTORY_SELECT_COLUMNS, HISTORY_TEST_VERSIONS } from '../lib/history-contract.mjs';
import { ACTORS, EVIDENCE_SCOPE, createHistoryDatabase, asActor, insertHistory } from '../scripts/history-postgres-harness.mjs';

let nextRequest = 1;
function payload(season = 2) {
  const v = HISTORY_TEST_VERSIONS.find(x => x.season === season);
  return { season, question_version: v.question_version, scoring_version: v.scoring_version, translation_version: v.translation_version,
    origin: v.origin, dimensions: v.axis_ids.map(id => ({ id, score: 0 })), consent_version: HISTORY_CONSENT_VERSION,
    client_request_id: `00000000-0000-4000-8000-${String(nextRequest++).padStart(12, '0')}` };
}
const denied = async promise => assert.rejects(promise, e => e.code === '42501');

test('PG_RULES_WITH_SYNTHETIC_AUTH: canonical migration enforces private history boundaries', async t => {
  const { pg, qualification, evidenceScope } = await createHistoryDatabase();
  try {
    assert.equal(evidenceScope, EVIDENCE_SCOPE);
    assert.equal(qualification.permissivePolicyDetected, true);
    t.diagnostic('Evidence is PostgreSQL rules with synthetic Auth, not real Supabase/GitHub acceptance.');
    t.diagnostic(qualification.version);
    const runAs = (actor, operation) => asActor(pg, 'authenticated', actor, operation);
    const runAsService = operation => asActor(pg, 'service_role', {}, operation);
    const readIds = () => pg.query('SELECT id FROM public.test_runs ORDER BY id');
    let aId, bId;

    await t.test('catalog matches immutable quiz identities and every table has RLS', async () => {
      const catalog = (await pg.query('SELECT * FROM community_private.test_versions ORDER BY season, question_version')).rows;
      assert.deepEqual(catalog, [...HISTORY_TEST_VERSIONS].sort((a, b) =>
        a.season - b.season || a.question_version.localeCompare(b.question_version)));
      const tables = (await pg.query("SELECT relname,relrowsecurity FROM pg_class WHERE oid IN ('public.test_runs'::regclass,'community_private.test_versions'::regclass,'community_private.history_capture_settings'::regclass)")).rows;
      assert.equal(tables.length, 3); assert.ok(tables.every(x => x.relrowsecurity));
      const rpcSecurity = (await pg.query(`SELECT namespace.nspname, procedure.prosecdef
        FROM pg_proc AS procedure JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
        WHERE procedure.oid IN ('public.history_capabilities()'::regprocedure, 'community_private.history_capabilities()'::regprocedure)
        ORDER BY namespace.nspname`)).rows;
      assert.deepEqual(rpcSecurity, [
        { nspname: 'community_private', prosecdef: true },
        { nspname: 'public', prosecdef: false },
      ]);
      await assert.rejects(pg.exec("UPDATE community_private.test_versions SET origin='independent_demo'"), e => e.code === '55000');
    });

    await t.test('anonymous, unauthenticated claims and the initial database capture gate reject access', async () => {
      await asActor(pg, 'anon', {}, async () => {
        await denied(readIds()); await denied(insertHistory(pg, payload())); await denied(pg.query('SELECT public.history_capabilities()'));
      });
      await runAs({}, async () => {
        assert.deepEqual((await readIds()).rows, []);
        await denied(insertHistory(pg, payload()));
      });
      await runAs(ACTORS.a, async () => {
        const c = (await pg.query('SELECT public.history_capabilities() AS value')).rows[0].value;
        assert.deepEqual(c, { session_active: true, capture_enabled: false, consent_version: HISTORY_CONSENT_VERSION });
        await denied(insertHistory(pg, payload()));
        await denied(pg.query('UPDATE community_private.history_capture_settings SET enabled=true'));
        await denied(pg.query('SELECT * FROM auth.sessions'));
        await denied(pg.query('SELECT * FROM community_private.test_versions'));
      });
      assert.equal((await pg.query('SELECT count(*)::int AS count FROM public.test_runs')).rows[0].count, 0);
    });

    await t.test('two synthetic actors insert only their own server-owned rows and cannot read each other', async () => {
      // Test fixture activation only, never part of the production migration.
      await pg.query('UPDATE community_private.history_capture_settings SET enabled=true');
      aId = await runAs(ACTORS.a, async () => (await insertHistory(pg, payload(1))).rows[0].id);
      bId = await runAs(ACTORS.b, async () => (await insertHistory(pg, payload(2))).rows[0].id);
      await runAs(ACTORS.a, async () => {
        assert.deepEqual((await readIds()).rows, [{ id: aId }]);
        assert.deepEqual((await pg.query('SELECT id FROM public.test_runs WHERE id=$1', [bId])).rows, []);
        const row = (await pg.query(`SELECT ${HISTORY_SELECT_COLUMNS} FROM public.test_runs`)).rows[0];
        assert.ok(row.created_at); assert.ok(row.consented_at); assert.equal(row.origin, 'independent_demo');
        await denied(pg.query('SELECT owner_id FROM public.test_runs'));
        await denied(pg.query('SELECT * FROM public.test_runs'));
      });
      await runAs(ACTORS.b, async () => assert.deepEqual((await readIds()).rows, [{ id: bId }]));
    });

    await t.test('server readback role bypasses RLS but can only select id and owner_id', async () => {
      await runAsService(async () => {
        const rows = (await pg.query('SELECT id,owner_id FROM public.test_runs ORDER BY owner_id')).rows;
        assert.deepEqual(rows, [{ id: aId, owner_id: ACTORS.a.sub }, { id: bId, owner_id: ACTORS.b.sub }]);
        assert.equal((await pg.query('SELECT count(*)::int AS count FROM public.test_runs WHERE owner_id=$1', [ACTORS.b.sub])).rows[0].count, 1);
        for (const column of HISTORY_SELECT_COLUMNS.split(',').filter(column => column !== 'id')) {
          await denied(pg.query(`SELECT ${column} FROM public.test_runs`));
        }
        await denied(pg.query('SELECT * FROM public.test_runs'));
        await denied(insertHistory(pg, payload()));
        await denied(pg.query('UPDATE public.test_runs SET owner_id=$1 WHERE id=$2', [ACTORS.a.sub, bId]));
        await denied(pg.query('DELETE FROM public.test_runs WHERE owner_id=$1', [ACTORS.b.sub]));
        await denied(pg.query('SELECT id FROM auth.users'));
        await denied(pg.query('SELECT id FROM auth.sessions'));
      });
      assert.equal((await pg.query('SELECT count(*)::int AS count FROM public.test_runs')).rows[0].count, 2);
    });

    await t.test('a live session belonging to the other actor cannot authorize the claimed owner', async () => {
      for (const claims of [
        { sub: ACTORS.a.sub, session_id: ACTORS.b.session_id },
        { sub: ACTORS.b.sub, session_id: ACTORS.a.session_id },
      ]) {
        await runAs(claims, async () => {
          assert.deepEqual((await readIds()).rows, []);
          await denied(insertHistory(pg, payload()));
          const caps = (await pg.query('SELECT public.history_capabilities() AS value')).rows[0].value;
          assert.equal(caps.session_active, false);
        });
      }
    });

    await t.test('owner spoofing, all server-owned insert columns and all updates are denied', async () => {
      await runAs(ACTORS.a, async () => {
        for (const [extraColumn, extraValue] of [['owner_id', ACTORS.b.sub], ['id', ACTORS.b.session_id], ['created_at', '2020-01-01T00:00:00Z'], ['consented_at', '2020-01-01T00:00:00Z']]) {
          await denied(insertHistory(pg, payload(), { extraColumn, extraValue }));
        }
        await denied(pg.query('UPDATE public.test_runs SET dimensions=$1 WHERE id=$2', [JSON.stringify(payload().dimensions), aId]));
        await denied(pg.query('UPDATE public.test_runs SET consent_version=$1 WHERE id=$2', ['synthetic', bId]));
      });
      assert.equal((await pg.query('SELECT count(*)::int AS count FROM public.test_runs')).rows[0].count, 2);
    });

    await t.test('missing, null, extra, wrong-version and invalid-score inputs never enter the database', async () => {
      const invalid = [];
      for (const key of ['season', 'question_version', 'scoring_version', 'translation_version', 'origin', 'dimensions', 'consent_version', 'client_request_id']) {
        const missing = payload(); delete missing[key]; invalid.push(missing);
        invalid.push({ ...payload(), [key]: null });
      }
      invalid.push({ ...payload(), question_version: 'unknown' }, { ...payload(), origin: 'licensed_official' },
        { ...payload(), consent_version: 'not-consented' }, { ...payload(), dimensions: [] }, { ...payload(), dimensions: {} },
        { ...payload(), dimensions: [null, null, null] });
      for (const score of [-101, 101, 0.5, null, '0']) {
        const p = payload(); p.dimensions[0].score = score; invalid.push(p);
      }
      const duplicate = payload(); duplicate.dimensions[1] = duplicate.dimensions[0]; invalid.push(duplicate);
      const extra = payload(); extra.dimensions[0].raw_answer = 'must-not-store'; invalid.push(extra);
      const extraTop = payload(); extraTop.answers = 'must-not-store'; invalid.push(extraTop);
      await runAs(ACTORS.a, async () => {
        for (const candidate of invalid) await assert.rejects(insertHistory(pg, candidate));
      });
      assert.equal((await pg.query('SELECT count(*)::int AS count FROM public.test_runs')).rows[0].count, 2);
    });

    await t.test('idempotency uniqueness is owner-scoped without an UPDATE privilege', async () => {
      const same = payload();
      const id = await runAs(ACTORS.a, async () => (await insertHistory(pg, same)).rows[0].id);
      await runAs(ACTORS.a, async () => await assert.rejects(insertHistory(pg, same), e => e.code === '23505'));
      const other = await runAs(ACTORS.b, async () => (await insertHistory(pg, same)).rows[0].id);
      assert.notEqual(id, other);
    });

    await t.test('cross-user deletion changes no rows and fresh owner readback is intact', async () => {
      await runAs(ACTORS.a, async () => assert.deepEqual((await pg.query('DELETE FROM public.test_runs WHERE id=$1 RETURNING id', [bId])).rows, []));
      await runAs(ACTORS.b, async () => assert.deepEqual((await pg.query('SELECT id FROM public.test_runs WHERE id=$1', [bId])).rows, [{ id: bId }]));
    });

    await t.test('missing capture configuration fails closed without trapping existing cleanup access', async () => {
      const temporaryId = await runAs(ACTORS.a, async () => (await insertHistory(pg, payload())).rows[0].id);
      await pg.query('DELETE FROM community_private.history_capture_settings');
      await runAs(ACTORS.a, async () => {
        const caps = (await pg.query('SELECT public.history_capabilities() AS value')).rows[0].value;
        assert.deepEqual(caps, { session_active: true, capture_enabled: false, consent_version: null });
        await denied(insertHistory(pg, payload()));
        assert.ok((await readIds()).rows.length > 0);
        assert.deepEqual((await pg.query('DELETE FROM public.test_runs WHERE id=$1 RETURNING id', [temporaryId])).rows, [{ id: temporaryId }]);
        assert.deepEqual((await pg.query('SELECT id FROM public.test_runs WHERE id=$1', [temporaryId])).rows, []);
      });
      await pg.query('INSERT INTO community_private.history_capture_settings(singleton,enabled,consent_version) VALUES (true,true,$1)', [HISTORY_CONSENT_VERSION]);
    });

    await t.test('capture shutdown and a consent-version change preserve existing own export and deletion', async () => {
      await pg.query("UPDATE community_private.history_capture_settings SET enabled=false, consent_version='history-consent-next-version'");
      await runAs(ACTORS.a, async () => {
        await denied(insertHistory(pg, payload()));
        const rows = (await pg.query(`SELECT ${HISTORY_SELECT_COLUMNS} FROM public.test_runs`)).rows;
        assert.ok(rows.length >= 1);
        assert.deepEqual((await pg.query('DELETE FROM public.test_runs WHERE id=$1 RETURNING id', [aId])).rows, [{ id: aId }]);
        assert.deepEqual((await pg.query('SELECT id FROM public.test_runs WHERE id=$1', [aId])).rows, []);
      });
      await pg.query('UPDATE community_private.history_capture_settings SET enabled=true, consent_version=$1', [HISTORY_CONSENT_VERSION]);
    });

    await t.test('deleted, expired, mismatched and missing sessions reject old-claim reads/writes', async () => {
      await pg.query('DELETE FROM auth.sessions WHERE id=$1', [ACTORS.a.session_id]);
      for (const claims of [ACTORS.a, { sub: ACTORS.b.sub, session_id: ACTORS.a.session_id }, { sub: ACTORS.b.sub }]) {
        await runAs(claims, async () => {
          assert.deepEqual((await readIds()).rows, []);
          await denied(insertHistory(pg, payload()));
          const caps = (await pg.query('SELECT public.history_capabilities() AS value')).rows[0].value;
          assert.equal(caps.session_active, false); assert.equal(caps.capture_enabled, false);
          assert.deepEqual((await pg.query('DELETE FROM public.test_runs WHERE id=$1 RETURNING id', [bId])).rows, []);
        });
      }
      await pg.query("UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=$1", [ACTORS.b.session_id]);
      await runAs(ACTORS.b, async () => { assert.deepEqual((await readIds()).rows, []); await denied(insertHistory(pg, payload())); });
      await pg.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1', [ACTORS.b.session_id]);
      assert.ok((await pg.query('SELECT count(*)::int AS count FROM public.test_runs')).rows[0].count > 0);
    });

    await t.test('synthetic Auth user removal cascades history and invalidates old claims', async () => {
      await runAsService(async () => {
        assert.ok((await pg.query('SELECT count(*)::int AS count FROM public.test_runs WHERE owner_id=$1', [ACTORS.b.sub])).rows[0].count > 0);
      });
      // The fixture owner models GoTrue deletion; service_role has no table DELETE.
      await pg.query('DELETE FROM auth.users WHERE id=$1', [ACTORS.b.sub]);
      await runAsService(async () => {
        assert.equal((await pg.query('SELECT count(*)::int AS count FROM public.test_runs WHERE owner_id=$1', [ACTORS.b.sub])).rows[0].count, 0);
        assert.ok((await pg.query('SELECT id FROM public.test_runs WHERE owner_id=$1', [ACTORS.a.sub])).rows.length > 0);
      });
      await runAs(ACTORS.b, async () => {
        assert.deepEqual((await readIds()).rows, []); await denied(insertHistory(pg, payload()));
        const caps = (await pg.query('SELECT public.history_capabilities() AS value')).rows[0].value;
        assert.equal(caps.session_active, false);
      });
    });
  } finally { await pg.close(); }
});
