-- Candidate only: requires an owner-designated Supabase project with Cron enabled.
-- Never enables history capture. All existing OAuth/privacy/isolation gates apply.
BEGIN;

-- Expired rows stop being visible even if scheduled physical cleanup is delayed.
ALTER POLICY test_runs_own_select ON public.test_runs
USING (owner_id = (SELECT auth.uid())
  AND (SELECT community_private.active_history_session())
  AND created_at > now() - interval '2160 hours');

CREATE INDEX test_runs_retention_created ON public.test_runs(created_at);

-- The preceding migration already defines and locks down this purge function.
-- Replace its per-minute job instead of creating a duplicate function/job.
-- Earlier deployed revisions used this legacy job name; remove it too so an
-- upgrade cannot leave two purge schedules active.
SELECT cron.unschedule('community-history-retention-90-days');
SELECT cron.unschedule('community-private-history-90-day-purge');

-- Fail installation if Cron is unavailable rather than promising unenforced deletion.
-- Hourly enforcement keeps expiry within one hour while limiting Cron run-log growth.
SELECT cron.schedule('community-private-history-90-day-purge', '0 * * * *',
  $$SELECT community_private.purge_expired_history();$$);

COMMIT;
