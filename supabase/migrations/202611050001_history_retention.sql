-- Candidate only: requires an owner-designated Supabase project with Cron enabled.
-- Never enables history capture. All existing OAuth/privacy/isolation gates apply.
BEGIN;

-- Expired rows stop being visible even if scheduled physical cleanup is delayed.
ALTER POLICY test_runs_own_select ON public.test_runs
USING (owner_id = (SELECT auth.uid())
  AND (SELECT community_private.active_history_session())
  AND created_at > now() - interval '2160 hours');

CREATE INDEX IF NOT EXISTS test_runs_retention_created ON public.test_runs(created_at);

-- Keep the fixed privileged function consistent on both fresh installs and upgrades.
CREATE OR REPLACE FUNCTION community_private.purge_expired_history() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE removed bigint;
BEGIN
  DELETE FROM public.test_runs
  WHERE created_at <= pg_catalog.now() - interval '90 days';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;
REVOKE ALL ON FUNCTION community_private.purge_expired_history()
  FROM PUBLIC, anon, authenticated, service_role;

-- Migrate whichever task name exists. Unschedule only discovered job IDs because
-- pg_cron raises an error when asked to remove a missing name.
DO $retention$
DECLARE
  job_id bigint;
  has_current_job boolean := false;
BEGIN
  FOR job_id IN SELECT jobid FROM cron.job
    WHERE jobname = 'community-history-retention-90-days'
  LOOP
    PERFORM cron.unschedule(job_id);
  END LOOP;

  FOR job_id IN SELECT jobid FROM cron.job
    WHERE jobname = 'community-private-history-90-day-purge'
  LOOP
    PERFORM cron.alter_job(job_id, schedule := '0 * * * *');
    has_current_job := true;
  END LOOP;

  IF NOT has_current_job THEN
    PERFORM cron.schedule('community-private-history-90-day-purge', '0 * * * *',
      'SELECT community_private.purge_expired_history();');
  END IF;
END;
$retention$;

COMMIT;
