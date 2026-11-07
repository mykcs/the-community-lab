import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

export const EVIDENCE_SCOPE = 'PG_RULES_WITH_SYNTHETIC_AUTH';
export const ACTORS = Object.freeze({
  a: { sub: '11111111-1111-4111-8111-111111111111', session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  b: { sub: '22222222-2222-4222-8222-222222222222', session_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
});

export async function qualifyPostgresRls(pg) {
  const version = (await pg.query('SELECT version()')).rows[0].version;
  await pg.exec(`
    CREATE ROLE history_qualification_actor NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE TABLE public.history_rls_qualification(owner_key text, value integer);
    INSERT INTO public.history_rls_qualification VALUES ('synthetic-a', 1), ('synthetic-b', 2);
    ALTER TABLE public.history_rls_qualification ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.history_rls_qualification TO history_qualification_actor;
    CREATE POLICY qualification_owner ON public.history_rls_qualification TO history_qualification_actor
      USING (owner_key = current_setting('history.test_owner', true))
      WITH CHECK (owner_key = current_setting('history.test_owner', true));
    SET ROLE history_qualification_actor;
    SET history.test_owner = 'synthetic-a';
  `);
  try {
    const role = (await pg.query('SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user')).rows[0];
    assert.equal(role.current_user, 'history_qualification_actor');
    assert.equal(role.rolsuper, false);
    assert.equal(role.rolbypassrls, false);
    assert.deepEqual((await pg.query('SELECT value FROM public.history_rls_qualification')).rows, [{ value: 1 }]);
    await assert.rejects(pg.query("INSERT INTO public.history_rls_qualification VALUES ('synthetic-b', 3)"), e => e.code === '42501');
    assert.equal((await pg.query("DELETE FROM public.history_rls_qualification WHERE owner_key = 'synthetic-b' RETURNING value")).rows.length, 0);
    assert.equal((await pg.query("UPDATE public.history_rls_qualification SET value = 99 WHERE owner_key = 'synthetic-b' RETURNING value")).rows.length, 0);
    await pg.query("INSERT INTO public.history_rls_qualification VALUES ('synthetic-a', 4)");
    await pg.exec(`RESET ROLE; DROP POLICY qualification_owner ON public.history_rls_qualification;
      CREATE POLICY qualification_owner ON public.history_rls_qualification TO history_qualification_actor USING (true) WITH CHECK (true);
      SET ROLE history_qualification_actor;`);
    // Negative control: the same expected owner-only assertion must detect this.
    const unsafeRows = (await pg.query('SELECT value FROM public.history_rls_qualification')).rows;
    assert.throws(() => assert.equal(unsafeRows.length, 2));
    return { version, role, permissivePolicyDetected: true };
  } finally {
    await pg.exec('RESET ROLE; DROP TABLE public.history_rls_qualification; DROP ROLE history_qualification_actor;');
  }
}

async function setSyntheticCronState(pg, state) {
  assert.ok(['current', 'legacy', 'both', 'none'].includes(state));
  const jobs = (await pg.query('SELECT jobid FROM cron.job')).rows;
  for (const job of jobs) await pg.query('SELECT cron.unschedule($1)', [job.jobid]);
  if (state === 'current' || state === 'both') {
    await pg.query(`SELECT cron.schedule('community-private-history-90-day-purge', '* * * * *',
      'SELECT community_private.purge_expired_history();')`);
  }
  if (state === 'legacy' || state === 'both') {
    await pg.query(`SELECT cron.schedule('community-history-retention-90-days', '* * * * *',
      'SELECT community_private.purge_expired_history();')`);
  }
}

export async function createHistoryDatabase({
  cronEnabled = true,
  applyMigration = true,
  preRetentionCronState = 'current',
  preUpgradeCronState = 'current',
} = {}) {
  const pg = new PGlite('memory://');
  try {
    const qualification = await qualifyPostgresRls(pg);
    await pg.exec(`
      CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE ROLE service_role NOLOGIN NOSUPERUSER BYPASSRLS;
      -- Model provider-wide default grants so the migration must revoke them.
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE auth.sessions(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, not_after timestamptz);
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
      $$;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid;
      $$;
      GRANT USAGE ON SCHEMA auth TO anon, authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO anon, authenticated;
      REVOKE ALL ON auth.users, auth.sessions FROM PUBLIC, anon, authenticated, service_role;
    `);
    for (const actor of Object.values(ACTORS)) {
      await pg.query('INSERT INTO auth.users(id) VALUES ($1)', [actor.sub]);
      await pg.query('INSERT INTO auth.sessions(id, user_id) VALUES ($1, $2)', [actor.session_id, actor.sub]);
    }
    if (cronEnabled) {
      // Synthetic pg_cron boundary: record the exact schedule without starting
      // background jobs inside PGlite.
      await pg.exec(`
        CREATE SCHEMA cron;
        CREATE TABLE cron.synthetic_jobs(jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          jobname text NOT NULL UNIQUE, schedule text NOT NULL, command text NOT NULL);
        CREATE VIEW cron.job AS SELECT jobid, jobname FROM cron.synthetic_jobs;
        CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint
        LANGUAGE plpgsql AS $$
        DECLARE scheduled_job_id bigint;
        BEGIN
          INSERT INTO cron.synthetic_jobs(jobname, schedule, command) VALUES (job_name, schedule, command)
          ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command
          RETURNING jobid INTO scheduled_job_id;
          RETURN scheduled_job_id;
        END;
        $$;
        CREATE FUNCTION cron.unschedule(job_id bigint) RETURNS boolean
        LANGUAGE plpgsql AS $$
        BEGIN
          DELETE FROM cron.synthetic_jobs WHERE jobid = job_id;
          IF NOT FOUND THEN RAISE EXCEPTION 'could not find valid entry for job'; END IF;
          RETURN true;
        END;
        $$;
        CREATE FUNCTION cron.alter_job(job_id bigint, schedule text DEFAULT NULL, command text DEFAULT NULL,
          database text DEFAULT NULL, username text DEFAULT NULL, active boolean DEFAULT NULL) RETURNS void
        LANGUAGE plpgsql AS $$
        BEGIN
          UPDATE cron.synthetic_jobs
            SET schedule = COALESCE(alter_job.schedule, synthetic_jobs.schedule),
                command = COALESCE(alter_job.command, synthetic_jobs.command)
            WHERE cron.synthetic_jobs.jobid = alter_job.job_id;
          IF NOT FOUND THEN RAISE EXCEPTION 'could not find valid entry for job'; END IF;
        END;
        $$;
      `);
    }
    if (applyMigration) {
      const initialMigration = await readFile(new URL('../supabase/migrations/202610290001_private_history.sql', import.meta.url), 'utf8');
      const retentionMigration = await readFile(new URL('../supabase/migrations/202611050001_history_retention.sql', import.meta.url), 'utf8');
      const upgradeMigration = await readFile(new URL('../supabase/migrations/202611060001_history_retention_schedule_upgrade.sql', import.meta.url), 'utf8');
      await pg.exec(initialMigration);
      if (cronEnabled) {
        await setSyntheticCronState(pg, preRetentionCronState);
      }
      await pg.exec(retentionMigration);
      if (cronEnabled) await setSyntheticCronState(pg, preUpgradeCronState);
      await pg.exec(upgradeMigration);
    }
    return { pg, qualification, evidenceScope: EVIDENCE_SCOPE };
  } catch (error) {
    await pg.close();
    throw error;
  }
}

export async function asActor(pg, role, claims, operation) {
  assert.ok(['anon', 'authenticated', 'service_role'].includes(role));
  await pg.exec('RESET ROLE');
  await pg.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims ?? {})]);
  await pg.exec(`SET ROLE ${role}`);
  try {
    const current = (await pg.query('SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user')).rows[0];
    assert.equal(current.current_user, role);
    assert.equal(current.rolsuper, false);
    assert.equal(current.rolbypassrls, role === 'service_role');
    return await operation();
  } finally {
    await pg.exec('RESET ROLE');
    await pg.query("SELECT set_config('request.jwt.claims', '{}', false)");
  }
}

export async function insertHistory(pg, payload, { extraColumn, extraValue } = {}) {
  const columns = Object.keys(payload);
  const values = columns.map(column => column === 'dimensions' ? JSON.stringify(payload[column]) : payload[column]);
  if (extraColumn) {
    assert.ok(['id', 'owner_id', 'created_at', 'consented_at'].includes(extraColumn));
    columns.push(extraColumn);
    values.push(extraValue);
  }
  assert.ok(columns.every(column => /^[a-z_]+$/.test(column)));
  return pg.query(`INSERT INTO public.test_runs (${columns.join(',')}) VALUES (${columns.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`, values);
}
