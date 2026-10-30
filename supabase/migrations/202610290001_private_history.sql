-- Disabled candidate. Apply only to an owner-designated Supabase target.
-- Do not enable capture until real OAuth, privacy and two-account gates pass.
-- Requires Supabase Auth's auth.uid(), auth.jwt(), auth.users and auth.sessions.
BEGIN;

CREATE SCHEMA community_private;
REVOKE ALL ON SCHEMA community_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA community_private TO authenticated;

CREATE TABLE community_private.test_versions (
  season smallint NOT NULL CHECK (season IN (1, 2)),
  question_version varchar(128) NOT NULL,
  scoring_version varchar(128) NOT NULL,
  translation_version varchar(128) NOT NULL,
  origin varchar(32) NOT NULL CHECK (origin = 'independent_demo'),
  axis_ids text[] NOT NULL CHECK (cardinality(axis_ids) BETWEEN 3 AND 4),
  PRIMARY KEY (season, question_version, scoring_version, translation_version, origin)
);
INSERT INTO community_private.test_versions VALUES
  (1, 'independent-s1-demo-0.1.0', 'independent-fourpoint-v1', 'demo-0.1.0', 'independent_demo', ARRAY['politics','gender','class','openness']),
  (1, 'independent-s1-demo-0.1.1', 'independent-fourpoint-v1', 'demo-s1-0.1.1', 'independent_demo', ARRAY['politics','gender','class','openness']),
  (2, 'independent-s2-demo-0.1.0', 'independent-binary-v1', 'demo-0.1.0', 'independent_demo', ARRAY['principle','structure','meaning']);
ALTER TABLE community_private.test_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON community_private.test_versions FROM PUBLIC, anon, authenticated;

CREATE FUNCTION community_private.keep_test_versions_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'History test versions are append-only' USING ERRCODE = '55000';
END;
$$;
REVOKE ALL ON FUNCTION community_private.keep_test_versions_immutable() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER test_versions_immutable BEFORE UPDATE OR DELETE ON community_private.test_versions
FOR EACH ROW EXECUTE FUNCTION community_private.keep_test_versions_immutable();

CREATE TABLE community_private.history_capture_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  consent_version varchar(64) NOT NULL CHECK (length(btrim(consent_version)) > 0)
);
INSERT INTO community_private.history_capture_settings(singleton, enabled, consent_version)
VALUES (true, false, 'history-consent-v1');
ALTER TABLE community_private.history_capture_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON community_private.history_capture_settings FROM PUBLIC, anon, authenticated;

CREATE FUNCTION community_private.active_history_session() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.sessions AS s
    WHERE s.user_id = (SELECT auth.uid())
      AND s.id::text = (SELECT auth.jwt() ->> 'session_id')
      AND (s.not_after IS NULL OR s.not_after > now())
  );
$$;
REVOKE ALL ON FUNCTION community_private.active_history_session() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION community_private.active_history_session() TO authenticated;

CREATE FUNCTION community_private.history_capture_allowed(candidate_consent text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_private.history_capture_settings AS settings
    WHERE settings.singleton AND settings.enabled AND settings.consent_version = candidate_consent
  );
$$;
REVOKE ALL ON FUNCTION community_private.history_capture_allowed(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION community_private.history_capture_allowed(text) TO authenticated;

CREATE FUNCTION community_private.valid_history_dimensions(
  candidate_season smallint, candidate_questions text, candidate_scoring text,
  candidate_translation text, candidate_origin text, candidate_dimensions jsonb
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  expected_axes text[];
  seen_axes text[] := ARRAY[]::text[];
  dimension jsonb;
  axis_id text;
  score numeric;
BEGIN
  SELECT v.axis_ids INTO expected_axes FROM community_private.test_versions AS v
  WHERE v.season = candidate_season AND v.question_version = candidate_questions
    AND v.scoring_version = candidate_scoring AND v.translation_version = candidate_translation
    AND v.origin = candidate_origin;
  IF expected_axes IS NULL OR candidate_dimensions IS NULL OR jsonb_typeof(candidate_dimensions) <> 'array' THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(candidate_dimensions) <> cardinality(expected_axes) THEN RETURN false; END IF;
  FOR dimension IN SELECT value FROM jsonb_array_elements(candidate_dimensions) LOOP
    IF jsonb_typeof(dimension) <> 'object' OR NOT dimension ?& ARRAY['id','score']
      OR (SELECT count(*) FROM jsonb_object_keys(dimension)) <> 2
      OR jsonb_typeof(dimension -> 'id') <> 'string'
      OR jsonb_typeof(dimension -> 'score') <> 'number' THEN RETURN false; END IF;
    axis_id := dimension ->> 'id';
    IF NOT axis_id = ANY(expected_axes) OR axis_id = ANY(seen_axes) THEN RETURN false; END IF;
    score := (dimension ->> 'score')::numeric;
    IF score < -100 OR score > 100 OR trunc(score) <> score THEN RETURN false; END IF;
    seen_axes := array_append(seen_axes, axis_id);
  END LOOP;
  RETURN cardinality(seen_axes) = cardinality(expected_axes);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION community_private.valid_history_dimensions(smallint,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION community_private.valid_history_dimensions(smallint,text,text,text,text,jsonb) TO authenticated;

CREATE TABLE public.test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  consented_at timestamptz NOT NULL DEFAULT now(),
  season smallint NOT NULL,
  question_version varchar(128) NOT NULL,
  scoring_version varchar(128) NOT NULL,
  translation_version varchar(128) NOT NULL,
  origin varchar(32) NOT NULL,
  dimensions jsonb NOT NULL,
  consent_version varchar(64) NOT NULL CHECK (length(btrim(consent_version)) > 0),
  client_request_id uuid NOT NULL,
  FOREIGN KEY (season, question_version, scoring_version, translation_version, origin)
    REFERENCES community_private.test_versions(season, question_version, scoring_version, translation_version, origin),
  CONSTRAINT test_runs_dimensions_valid CHECK (
    community_private.valid_history_dimensions(season, question_version, scoring_version, translation_version, origin, dimensions)
  ),
  UNIQUE (owner_id, client_request_id)
);
CREATE INDEX test_runs_owner_created_id ON public.test_runs(owner_id, created_at DESC, id DESC);
ALTER TABLE public.test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_runs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.test_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT (id,season,question_version,scoring_version,translation_version,origin,dimensions,consent_version,client_request_id,created_at,consented_at)
  ON public.test_runs TO authenticated;
GRANT INSERT (season,question_version,scoring_version,translation_version,origin,dimensions,consent_version,client_request_id)
  ON public.test_runs TO authenticated;
GRANT DELETE ON public.test_runs TO authenticated;
-- Server-only account removal readback. Explicitly override provider defaults;
-- Auth deletion uses GoTrue's admin API and the FK cascade, not table DELETE.
REVOKE ALL ON public.test_runs FROM service_role;
GRANT SELECT (id, owner_id) ON public.test_runs TO service_role;

CREATE POLICY test_runs_own_select ON public.test_runs FOR SELECT TO authenticated
USING (owner_id = (SELECT auth.uid()) AND (SELECT community_private.active_history_session()));
CREATE POLICY test_runs_own_insert ON public.test_runs FOR INSERT TO authenticated
WITH CHECK (owner_id = (SELECT auth.uid()) AND (SELECT community_private.active_history_session())
  AND community_private.history_capture_allowed(consent_version));
CREATE POLICY test_runs_own_delete ON public.test_runs FOR DELETE TO authenticated
USING (owner_id = (SELECT auth.uid()) AND (SELECT community_private.active_history_session()));

-- Keep privileged reads in the non-exposed schema. The only Data API RPC is an
-- invoker wrapper with no direct table privileges or caller-controlled args.
CREATE FUNCTION community_private.history_capabilities() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'session_active', community_private.active_history_session(),
    'capture_enabled', community_private.active_history_session() AND COALESCE(
      (SELECT settings.enabled FROM community_private.history_capture_settings AS settings WHERE settings.singleton), false),
    'consent_version', (SELECT settings.consent_version FROM community_private.history_capture_settings AS settings WHERE settings.singleton)
  );
$$;
REVOKE ALL ON FUNCTION community_private.history_capabilities() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION community_private.history_capabilities() TO authenticated;

-- Supabase advises against SECURITY DEFINER functions in exposed schemas.
-- This public RPC delegates only the fixed capability response above.
CREATE FUNCTION public.history_capabilities() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT community_private.history_capabilities();
$$;
REVOKE ALL ON FUNCTION public.history_capabilities() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.history_capabilities() TO authenticated;

COMMIT;
