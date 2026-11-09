-- The initial history migration already creates the canonical created_at index.
-- The first retention upgrade introduced a second index on the same column.
-- Drop only that redundant index and keep the original one for retention scans.
BEGIN;

DROP INDEX IF EXISTS public.test_runs_retention_created;
CREATE INDEX IF NOT EXISTS test_runs_created_at_retention
  ON public.test_runs(created_at);

COMMIT;
