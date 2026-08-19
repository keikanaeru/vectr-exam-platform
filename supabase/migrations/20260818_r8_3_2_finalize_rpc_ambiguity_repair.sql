-- ============================================================
-- VECTR EXAM PLATFORM R8.3.2
-- FINALIZER RPC AMBIGUITY REPAIR
--
-- Fixes PostgreSQL 42702:
--   column reference "session_id" is ambiguous
--
-- Root cause:
-- exam_finalize_session_r82 RETURNS TABLE(session_id, ...), so PL/pgSQL
-- creates an output variable named session_id. The R8.2 function also used
-- unqualified SQL references such as ON CONFLICT (session_id) and
-- WHERE session_id = p_session_id.
--
-- This migration replaces ONLY the function definition and adds a healthcheck.
-- No candidate/exam/session/result rows are deleted.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.exam_finalize_session_r82(
  p_session_id uuid
)
RETURNS TABLE(
  session_id uuid,
  raw_score numeric,
  max_score numeric,
  final_score numeric,
  correct_count integer,
  wrong_count integer,
  blank_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_now timestamptz := clock_timestamp();
  v_submitted_at timestamptz;
  v_raw numeric := 0;
  v_max numeric := 0;
  v_final numeric := 0;
  v_correct integer := 0;
  v_wrong integer := 0;
  v_blank integer := 0;
  v_question_count integer := 0;
BEGIN
  SELECT s.submitted_at
    INTO v_submitted_at
  FROM public.exam_sessions AS s
  WHERE s.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Sesi ujian tidak ditemukan.';
  END IF;

  SELECT count(*)::integer
    INTO v_question_count
  FROM public.session_questions AS sq
  WHERE sq.session_id = p_session_id;

  IF v_question_count < 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Sesi belum memiliki snapshot soal. Submit dibatalkan.';
  END IF;

  WITH scored AS (
    SELECT
      CASE
        WHEN coalesce(sq.question_snapshot ->> 'weight', '') ~ '^[0-9]+([.][0-9]+)?$'
         AND (sq.question_snapshot ->> 'weight')::numeric > 0
          THEN (sq.question_snapshot ->> 'weight')::numeric
        ELSE 1::numeric
      END AS weight,
      nullif(sq.question_snapshot ->> 'correct_option_id', '') AS correct_option_id,
      nullif(a.selected_option_id::text, '') AS selected_option_id
    FROM public.session_questions AS sq
    LEFT JOIN public.answers AS a
      ON a.session_question_id = sq.id
    WHERE sq.session_id = p_session_id
  )
  SELECT
    coalesce(
      sum(
        CASE
          WHEN correct_option_id IS NOT NULL
           AND selected_option_id = correct_option_id
            THEN weight
          ELSE 0
        END
      ),
      0
    ),
    coalesce(sum(weight), 0),
    count(*) FILTER (
      WHERE correct_option_id IS NOT NULL
        AND selected_option_id = correct_option_id
    )::integer,
    count(*) FILTER (
      WHERE selected_option_id IS NOT NULL
        AND NOT (
          correct_option_id IS NOT NULL
          AND selected_option_id = correct_option_id
        )
    )::integer,
    count(*) FILTER (
      WHERE selected_option_id IS NULL
    )::integer
  INTO
    v_raw,
    v_max,
    v_correct,
    v_wrong,
    v_blank
  FROM scored;

  v_final := CASE
    WHEN v_max > 0 THEN round((v_raw / v_max) * 100, 2)
    ELSE 0
  END;

  INSERT INTO public.results (
    session_id,
    raw_score,
    max_score,
    final_score,
    correct_count,
    wrong_count,
    blank_count
  ) VALUES (
    p_session_id,
    v_raw,
    v_max,
    v_final,
    v_correct,
    v_wrong,
    v_blank
  )
  ON CONFLICT (session_id) DO UPDATE
    SET raw_score = EXCLUDED.raw_score,
        max_score = EXCLUDED.max_score,
        final_score = EXCLUDED.final_score,
        correct_count = EXCLUDED.correct_count,
        wrong_count = EXCLUDED.wrong_count,
        blank_count = EXCLUDED.blank_count;

  v_submitted_at := coalesce(v_submitted_at, v_now);

  UPDATE public.exam_section_progress AS esp
  SET status = 'TIMED_OUT',
      completed_at = v_submitted_at,
      updated_at = v_now
  WHERE esp.session_id = p_session_id
    AND esp.status IN ('ACTIVE', 'PENDING');

  UPDATE public.exam_sessions AS es
  SET status = 'SUBMITTED',
      submitted_at = v_submitted_at,
      last_seen_at = v_now,
      updated_at = v_now
  WHERE es.id = p_session_id;

  RETURN QUERY
  SELECT
    p_session_id,
    v_raw,
    v_max,
    v_final,
    v_correct,
    v_wrong,
    v_blank;
END;
$$;

REVOKE ALL
  ON FUNCTION public.exam_finalize_session_r82(uuid)
  FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION public.exam_finalize_session_r82(uuid)
  TO service_role;

-- Dedicated guard for this exact runtime contract.
CREATE OR REPLACE FUNCTION public.exam_platform_r832_healthcheck()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_definition text := '';
  v_results_unique boolean := false;
  v_session_question_unique boolean := false;
BEGIN
  IF to_regprocedure('public.exam_finalize_session_r82(uuid)') IS NULL THEN
    v_missing := array_append(
      v_missing,
      'rpc:exam_finalize_session_r82'
    );
  ELSE
    SELECT pg_get_functiondef(
      to_regprocedure('public.exam_finalize_session_r82(uuid)')
    )
    INTO v_definition;

    IF position(
      '#variable_conflict use_column'
      IN v_definition
    ) = 0 THEN
      v_missing := array_append(
        v_missing,
        'finalizer:variable_conflict_guard'
      );
    END IF;

    IF position(
      'UPDATE public.exam_section_progress AS esp'
      IN v_definition
    ) = 0 THEN
      v_missing := array_append(
        v_missing,
        'finalizer:qualified_exam_section_progress'
      );
    END IF;

    IF position(
      'UPDATE public.exam_sessions AS es'
      IN v_definition
    ) = 0 THEN
      v_missing := array_append(
        v_missing,
        'finalizer:qualified_exam_sessions'
      );
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_index AS i
    WHERE i.indrelid = to_regclass('public.results')
      AND i.indisunique
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND (
        SELECT array_agg(a.attname::text ORDER BY u.ord)
        FROM unnest(
          string_to_array(trim(i.indkey::text), ' ')::smallint[]
        ) WITH ORDINALITY AS u(attnum, ord)
        JOIN pg_attribute AS a
          ON a.attrelid = i.indrelid
         AND a.attnum = u.attnum
      ) = ARRAY['session_id']::text[]
  )
  INTO v_results_unique;

  IF NOT v_results_unique THEN
    v_missing := array_append(
      v_missing,
      'unique:results(session_id)'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_index AS i
    WHERE i.indrelid = to_regclass('public.session_questions')
      AND i.indisunique
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND (
        SELECT array_agg(a.attname::text ORDER BY u.ord)
        FROM unnest(
          string_to_array(trim(i.indkey::text), ' ')::smallint[]
        ) WITH ORDINALITY AS u(attnum, ord)
        JOIN pg_attribute AS a
          ON a.attrelid = i.indrelid
         AND a.attnum = u.attnum
      ) = ARRAY['session_id', 'question_id']::text[]
  )
  INTO v_session_question_unique;

  IF NOT v_session_question_unique THEN
    v_missing := array_append(
      v_missing,
      'unique:session_questions(session_id,question_id)'
    );
  END IF;

  RETURN jsonb_build_object(
    'version', 'R8.3.2-FINALIZER',
    'ok', cardinality(v_missing) = 0,
    'missing', to_jsonb(v_missing),
    'checked_at', now()
  );
END;
$$;

REVOKE ALL
  ON FUNCTION public.exam_platform_r832_healthcheck()
  FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION public.exam_platform_r832_healthcheck()
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT public.exam_platform_r832_healthcheck() AS vectr_r832_health;
