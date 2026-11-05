-- Candidate only: requires an owner-designated Supabase project with Cron enabled.
-- Never enables history capture. All existing OAuth/privacy/isolation gates apply.
BEGIN;

-- Expired rows stop being visible even if scheduled physical cleanup is delayed.
ALTER POLICY test_runs_own_select ON public.test_runs
USING (owner_id = (SELECT auth.uid())
  AND (SELECT community_private.active_history_session())
  AND created_at > now() - interval '2160 hours');

CREATE INDEX test_runs_retention_created ON public.test_runs(created_at);

CREATE FUNCTION community_private.purge_expired_history() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE removed bigint;
BEGIN
  DELETE FROM public.test_runs
  WHERE created_at <= now() - interval '2160 hours';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;
REVOKE ALL ON FUNCTION community_private.purge_expired_history()
  FROM PUBLIC, anon, authenticated, service_role;

-- Fail installation if Cron is unavailable rather than promising unenforced deletion.
-- Only the database owner schedules/runs this private function.
-- Hourly enforcement keeps expiry within one hour while limiting Cron run-log growth.
SELECT cron.schedule('community-history-retention-90-days', '0 * * * *',
  $$SELECT community_private.purge_expired_history();$$);

COMMIT;
