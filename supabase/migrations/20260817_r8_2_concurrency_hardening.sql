-- ============================================================
-- VECTR EXAM PLATFORM R8.2 — CONCURRENCY HARDENING
-- Target: 100–200 concurrent participants on bursty exam starts.
-- Safe to run repeatedly after R6/R7 migrations.
-- ============================================================

BEGIN;

-- A durable readiness marker lets normal section page loads skip the expensive
-- question-bank provisioning scan after the session snapshot is complete.
ALTER TABLE public.exam_sessions
  ADD COLUMN IF NOT EXISTS snapshot_ready_at timestamptz;

-- Hot-path indexes for candidate login/start/heartbeat/autosave.
CREATE INDEX IF NOT EXISTS exam_sessions_assignment_status_attempt_r82_idx
  ON public.exam_sessions(assignment_id, status, attempt_no DESC);

CREATE INDEX IF NOT EXISTS exam_assignments_candidate_active_r82_idx
  ON public.exam_assignments(candidate_id, exam_id)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS questions_module_active_created_r82_idx
  ON public.questions(module_id, created_at)
  WHERE status = 'ACTIVE';

-- ------------------------------------------------------------
-- Atomic heartbeat + single-device lease.
-- One RPC replaces the previous session + assignment + exam + lock
-- read/write + session update fan-out.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exam_candidate_heartbeat_r82(
  p_assignment_id uuid,
  p_candidate_id uuid,
  p_exam_id uuid,
  p_client_id text DEFAULT '',
  p_user_agent text DEFAULT ''
)
RETURNS TABLE(ok boolean, conflict boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_session_id uuid;
  v_exam_settings jsonb;
  v_enforce_single_device boolean := true;
  v_lock_client text;
  v_safe_client text := left(trim(coalesce(p_client_id, '')), 180);
BEGIN
  SELECT s.id, e.settings
    INTO v_session_id, v_exam_settings
  FROM public.exam_sessions s
  JOIN public.exam_assignments a ON a.id = s.assignment_id
  JOIN public.exams e ON e.id = a.exam_id
  WHERE s.assignment_id = p_assignment_id
    AND a.candidate_id = p_candidate_id
    AND a.exam_id = p_exam_id
    AND a.active = true
    AND s.status = 'ACTIVE'
  ORDER BY s.attempt_no DESC
  LIMIT 1;

  IF v_session_id IS NULL THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;

  BEGIN
    v_enforce_single_device := COALESCE(
      (v_exam_settings #>> '{exam_policy,security,enforceSingleDevice}')::boolean,
      true
    );
  EXCEPTION WHEN invalid_text_representation THEN
    v_enforce_single_device := true;
  END;

  IF v_enforce_single_device AND v_safe_client <> '' THEN
    v_lock_client := NULL;

    INSERT INTO public.proctor_client_locks AS lock_row (
      session_id,
      exam_id,
      candidate_id,
      client_id,
      user_agent,
      last_seen_at
    ) VALUES (
      v_session_id,
      p_exam_id,
      p_candidate_id,
      v_safe_client,
      left(coalesce(p_user_agent, ''), 500),
      v_now
    )
    ON CONFLICT (session_id) DO UPDATE
      SET client_id = EXCLUDED.client_id,
          user_agent = EXCLUDED.user_agent,
          last_seen_at = EXCLUDED.last_seen_at
      WHERE lock_row.client_id = EXCLUDED.client_id
         OR lock_row.last_seen_at < v_now - interval '90 seconds'
    RETURNING lock_row.client_id INTO v_lock_client;

    -- Fresh lock owned by a different device: reject atomically.
    IF v_lock_client IS NULL THEN
      RETURN QUERY SELECT false, true;
      RETURN;
    END IF;
  END IF;

  UPDATE public.exam_sessions
  SET last_seen_at = v_now,
      updated_at = v_now
  WHERE id = v_session_id
    AND status = 'ACTIVE';

  RETURN QUERY SELECT true, false;
END;
$$;

REVOKE ALL ON FUNCTION public.exam_candidate_heartbeat_r82(uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exam_candidate_heartbeat_r82(uuid, uuid, uuid, text, text) TO service_role;

-- ------------------------------------------------------------
-- Atomic answer autosave.
-- Validates identity, active session, global/section deadlines and
-- option membership, then upserts answer in the same transaction.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exam_candidate_save_answer_r82(
  p_assignment_id uuid,
  p_candidate_id uuid,
  p_exam_id uuid,
  p_session_question_id uuid,
  p_selected_option_id text,
  p_client_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_session_id uuid;
  v_session_deadline timestamptz;
  v_hard_close timestamptz;
  v_section_id uuid;
  v_snapshot jsonb;
  v_section_status text;
  v_section_deadline timestamptz;
  v_exam_settings jsonb;
  v_enforce_single_device boolean := true;
  v_lock_client text;
  v_safe_client text := left(trim(coalesce(p_client_id, '')), 180);
BEGIN
  SELECT
    sq.session_id,
    s.deadline_at,
    e.hard_close_at,
    sq.exam_section_id,
    sq.question_snapshot,
    e.settings
  INTO
    v_session_id,
    v_session_deadline,
    v_hard_close,
    v_section_id,
    v_snapshot,
    v_exam_settings
  FROM public.session_questions sq
  JOIN public.exam_sessions s ON s.id = sq.session_id
  JOIN public.exam_assignments a ON a.id = s.assignment_id
  JOIN public.exams e ON e.id = a.exam_id
  WHERE sq.id = p_session_question_id
    AND a.id = p_assignment_id
    AND a.candidate_id = p_candidate_id
    AND a.exam_id = p_exam_id
    AND a.active = true
    AND s.status = 'ACTIVE'
  LIMIT 1
  FOR UPDATE OF s;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Sesi ujian tidak aktif atau soal tidak valid.';
  END IF;

  IF v_session_deadline IS NULL OR v_now >= v_session_deadline THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Waktu ujian sudah habis.';
  END IF;

  IF v_hard_close IS NULL OR v_now >= v_hard_close THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Hard Close ujian sudah tercapai.';
  END IF;

  BEGIN
    v_enforce_single_device := COALESCE(
      (v_exam_settings #>> '{exam_policy,security,enforceSingleDevice}')::boolean,
      true
    );
  EXCEPTION WHEN invalid_text_representation THEN
    v_enforce_single_device := true;
  END;

  IF v_enforce_single_device THEN
    IF v_safe_client = '' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Identitas perangkat tidak valid. Silakan login ulang.';
    END IF;

    v_lock_client := NULL;
    INSERT INTO public.proctor_client_locks AS lock_row (
      session_id, exam_id, candidate_id, client_id, user_agent, last_seen_at
    ) VALUES (
      v_session_id, p_exam_id, p_candidate_id, v_safe_client, '', v_now
    )
    ON CONFLICT (session_id) DO UPDATE
      SET client_id = EXCLUDED.client_id,
          last_seen_at = EXCLUDED.last_seen_at
      WHERE lock_row.client_id = EXCLUDED.client_id
         OR lock_row.last_seen_at < v_now - interval '90 seconds'
    RETURNING lock_row.client_id INTO v_lock_client;

    IF v_lock_client IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Credential sedang aktif di perangkat lain.';
    END IF;
  END IF;

  IF v_section_id IS NOT NULL THEN
    SELECT status, deadline_at
      INTO v_section_status, v_section_deadline
    FROM public.exam_section_progress
    WHERE session_id = v_session_id
      AND exam_section_id = v_section_id
    LIMIT 1;

    IF v_section_status IS DISTINCT FROM 'ACTIVE' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Sesi modul soal ini sudah tidak aktif.';
    END IF;

    IF v_section_deadline IS NOT NULL AND v_now >= v_section_deadline THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Waktu sesi modul sudah habis.';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_snapshot -> 'options', '[]'::jsonb)) AS option_row
    WHERE option_row ->> 'id' = p_selected_option_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Pilihan jawaban tidak valid.';
  END IF;

  INSERT INTO public.answers (
    session_question_id,
    selected_option_id,
    answered_at,
    updated_at
  ) VALUES (
    p_session_question_id,
    p_selected_option_id,
    v_now,
    v_now
  )
  ON CONFLICT (session_question_id) DO UPDATE
    SET selected_option_id = EXCLUDED.selected_option_id,
        answered_at = EXCLUDED.answered_at,
        updated_at = EXCLUDED.updated_at;

  UPDATE public.exam_sessions
  SET last_seen_at = v_now,
      updated_at = v_now
  WHERE id = v_session_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.exam_candidate_save_answer_r82(uuid, uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exam_candidate_save_answer_r82(uuid, uuid, uuid, uuid, text, text) TO service_role;

-- ------------------------------------------------------------
-- Atomic flag autosave. Same deadline/session checks, but no option work.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exam_candidate_save_flag_r82(
  p_assignment_id uuid,
  p_candidate_id uuid,
  p_exam_id uuid,
  p_session_question_id uuid,
  p_flagged boolean,
  p_client_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_session_id uuid;
  v_session_deadline timestamptz;
  v_hard_close timestamptz;
  v_section_id uuid;
  v_section_status text;
  v_section_deadline timestamptz;
  v_exam_settings jsonb;
  v_enforce_single_device boolean := true;
  v_lock_client text;
  v_safe_client text := left(trim(coalesce(p_client_id, '')), 180);
BEGIN
  SELECT
    sq.session_id,
    s.deadline_at,
    e.hard_close_at,
    sq.exam_section_id,
    e.settings
  INTO
    v_session_id,
    v_session_deadline,
    v_hard_close,
    v_section_id,
    v_exam_settings
  FROM public.session_questions sq
  JOIN public.exam_sessions s ON s.id = sq.session_id
  JOIN public.exam_assignments a ON a.id = s.assignment_id
  JOIN public.exams e ON e.id = a.exam_id
  WHERE sq.id = p_session_question_id
    AND a.id = p_assignment_id
    AND a.candidate_id = p_candidate_id
    AND a.exam_id = p_exam_id
    AND a.active = true
    AND s.status = 'ACTIVE'
  LIMIT 1
  FOR UPDATE OF s;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Sesi ujian tidak aktif atau soal tidak valid.';
  END IF;

  IF v_session_deadline IS NULL OR v_now >= v_session_deadline THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Waktu ujian sudah habis.';
  END IF;

  IF v_hard_close IS NULL OR v_now >= v_hard_close THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Hard Close ujian sudah tercapai.';
  END IF;

  BEGIN
    v_enforce_single_device := COALESCE(
      (v_exam_settings #>> '{exam_policy,security,enforceSingleDevice}')::boolean,
      true
    );
  EXCEPTION WHEN invalid_text_representation THEN
    v_enforce_single_device := true;
  END;

  IF v_enforce_single_device THEN
    IF v_safe_client = '' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Identitas perangkat tidak valid. Silakan login ulang.';
    END IF;

    v_lock_client := NULL;
    INSERT INTO public.proctor_client_locks AS lock_row (
      session_id, exam_id, candidate_id, client_id, user_agent, last_seen_at
    ) VALUES (
      v_session_id, p_exam_id, p_candidate_id, v_safe_client, '', v_now
    )
    ON CONFLICT (session_id) DO UPDATE
      SET client_id = EXCLUDED.client_id,
          last_seen_at = EXCLUDED.last_seen_at
      WHERE lock_row.client_id = EXCLUDED.client_id
         OR lock_row.last_seen_at < v_now - interval '90 seconds'
    RETURNING lock_row.client_id INTO v_lock_client;

    IF v_lock_client IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Credential sedang aktif di perangkat lain.';
    END IF;
  END IF;

  IF v_section_id IS NOT NULL THEN
    SELECT status, deadline_at
      INTO v_section_status, v_section_deadline
    FROM public.exam_section_progress
    WHERE session_id = v_session_id
      AND exam_section_id = v_section_id
    LIMIT 1;

    IF v_section_status IS DISTINCT FROM 'ACTIVE' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Sesi modul soal ini sudah tidak aktif.';
    END IF;

    IF v_section_deadline IS NOT NULL AND v_now >= v_section_deadline THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Waktu sesi modul sudah habis.';
    END IF;
  END IF;

  INSERT INTO public.answers (
    session_question_id,
    flagged,
    updated_at
  ) VALUES (
    p_session_question_id,
    p_flagged,
    v_now
  )
  ON CONFLICT (session_question_id) DO UPDATE
    SET flagged = EXCLUDED.flagged,
        updated_at = EXCLUDED.updated_at;

  UPDATE public.exam_sessions
  SET last_seen_at = v_now,
      updated_at = v_now
  WHERE id = v_session_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.exam_candidate_save_flag_r82(uuid, uuid, uuid, uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exam_candidate_save_flag_r82(uuid, uuid, uuid, uuid, boolean, text) TO service_role;

-- ------------------------------------------------------------
-- Atomic finalization/scoring.
-- One RPC replaces the old 5-request read/score/upsert/close path and locks
-- the session row so a last-millisecond answer cannot race the final score.
-- ------------------------------------------------------------
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
  FROM public.exam_sessions s
  WHERE s.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Sesi ujian tidak ditemukan.';
  END IF;

  SELECT count(*)::integer
    INTO v_question_count
  FROM public.session_questions sq
  WHERE sq.session_id = p_session_id;

  IF v_question_count < 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Sesi belum memiliki snapshot soal. Submit dibatalkan.';
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
    FROM public.session_questions sq
    LEFT JOIN public.answers a ON a.session_question_id = sq.id
    WHERE sq.session_id = p_session_id
  )
  SELECT
    coalesce(sum(CASE WHEN correct_option_id IS NOT NULL AND selected_option_id = correct_option_id THEN weight ELSE 0 END), 0),
    coalesce(sum(weight), 0),
    count(*) FILTER (WHERE correct_option_id IS NOT NULL AND selected_option_id = correct_option_id)::integer,
    count(*) FILTER (WHERE selected_option_id IS NOT NULL AND NOT (correct_option_id IS NOT NULL AND selected_option_id = correct_option_id))::integer,
    count(*) FILTER (WHERE selected_option_id IS NULL)::integer
  INTO v_raw, v_max, v_correct, v_wrong, v_blank
  FROM scored;

  v_final := CASE
    WHEN v_max > 0 THEN round((v_raw / v_max) * 100, 2)
    ELSE 0
  END;

  INSERT INTO public.results (
    session_id, raw_score, max_score, final_score, correct_count, wrong_count, blank_count
  ) VALUES (
    p_session_id, v_raw, v_max, v_final, v_correct, v_wrong, v_blank
  )
  ON CONFLICT (session_id) DO UPDATE
    SET raw_score = EXCLUDED.raw_score,
        max_score = EXCLUDED.max_score,
        final_score = EXCLUDED.final_score,
        correct_count = EXCLUDED.correct_count,
        wrong_count = EXCLUDED.wrong_count,
        blank_count = EXCLUDED.blank_count;

  v_submitted_at := coalesce(v_submitted_at, v_now);

  UPDATE public.exam_section_progress
  SET status = 'TIMED_OUT',
      completed_at = v_submitted_at,
      updated_at = v_now
  WHERE session_id = p_session_id
    AND status IN ('ACTIVE', 'PENDING');

  UPDATE public.exam_sessions
  SET status = 'SUBMITTED',
      submitted_at = v_submitted_at,
      last_seen_at = v_now,
      updated_at = v_now
  WHERE id = p_session_id;

  RETURN QUERY SELECT p_session_id, v_raw, v_max, v_final, v_correct, v_wrong, v_blank;
END;
$$;

REVOKE ALL ON FUNCTION public.exam_finalize_session_r82(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exam_finalize_session_r82(uuid) TO service_role;

-- Lightweight contract check consumed by scripts/db-health.mjs.
CREATE OR REPLACE FUNCTION public.exam_platform_r82_healthcheck()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  missing_items text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exam_sessions'
      AND column_name = 'snapshot_ready_at'
  ) THEN
    missing_items := array_append(missing_items, 'column:exam_sessions.snapshot_ready_at');
  END IF;

  IF to_regprocedure('public.exam_candidate_heartbeat_r82(uuid,uuid,uuid,text,text)') IS NULL THEN
    missing_items := array_append(missing_items, 'rpc:exam_candidate_heartbeat_r82');
  END IF;
  IF to_regprocedure('public.exam_candidate_save_answer_r82(uuid,uuid,uuid,uuid,text,text)') IS NULL THEN
    missing_items := array_append(missing_items, 'rpc:exam_candidate_save_answer_r82');
  END IF;
  IF to_regprocedure('public.exam_candidate_save_flag_r82(uuid,uuid,uuid,uuid,boolean,text)') IS NULL THEN
    missing_items := array_append(missing_items, 'rpc:exam_candidate_save_flag_r82');
  END IF;
  IF to_regprocedure('public.exam_finalize_session_r82(uuid)') IS NULL THEN
    missing_items := array_append(missing_items, 'rpc:exam_finalize_session_r82');
  END IF;
  IF to_regclass('public.exam_sessions_assignment_status_attempt_r82_idx') IS NULL THEN
    missing_items := array_append(missing_items, 'index:exam_sessions_assignment_status_attempt_r82_idx');
  END IF;
  IF to_regclass('public.exam_assignments_candidate_active_r82_idx') IS NULL THEN
    missing_items := array_append(missing_items, 'index:exam_assignments_candidate_active_r82_idx');
  END IF;
  IF to_regclass('public.questions_module_active_created_r82_idx') IS NULL THEN
    missing_items := array_append(missing_items, 'index:questions_module_active_created_r82_idx');
  END IF;

  RETURN jsonb_build_object(
    'ok', cardinality(missing_items) = 0,
    'version', 'R8.2-CONCURRENCY',
    'missing', to_jsonb(missing_items)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.exam_platform_r82_healthcheck() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exam_platform_r82_healthcheck() TO service_role;

COMMIT;
