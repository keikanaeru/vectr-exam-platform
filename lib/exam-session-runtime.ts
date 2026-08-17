import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

type Snapshot = {
  correct_option_id?: unknown;
  weight?: unknown;
};

type FinalizedResult = {
  session_id: string;
  raw_score: number;
  max_score: number;
  final_score: number;
  correct_count: number;
  wrong_count: number;
  blank_count: number;
};

function dbDetail(error: { code?: string | null; message?: string | null } | null | undefined) {
  if (!error) return "DB_ERROR";
  const code = error.code ? String(error.code) : "DB";
  const message = error.message ? String(error.message) : "Operasi database gagal.";
  return `[${code}] ${message}`;
}

function safeWeight(value: unknown) {
  const parsed = Number(value ?? 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * R6 application-owned scoring path.
 *
 * The legacy V2 submit RPC is intentionally not required here. Every score is
 * calculated from the immutable question snapshot stored for this session, so
 * multi-section exams and legacy one-section exams use the exact same path.
 * The function is idempotent: calling it again rewrites the same result row and
 * keeps the first submitted_at timestamp when the session is already closed.
 */
export async function finalizeExamSession(
  supabase: AdminClient,
  sessionId: string
): Promise<FinalizedResult> {
  const { data: session, error: sessionError } = await supabase
    .from("exam_sessions")
    .select("id, status, submitted_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !session) {
    throw new Error(`Sesi ujian gagal dibaca ${dbDetail(sessionError)}.`);
  }

  const { data: questions, error: questionError } = await supabase
    .from("session_questions")
    .select("id, question_snapshot")
    .eq("session_id", sessionId);

  if (questionError) {
    throw new Error(`Snapshot soal gagal dibaca ${dbDetail(questionError)}.`);
  }

  if (!(questions ?? []).length) {
    throw new Error(
      "Sesi belum memiliki snapshot soal. Submit dibatalkan agar hasil 0 tidak tercatat karena kegagalan sistem."
    );
  }

  const questionIds = (questions ?? []).map((row) => String(row.id));
  const { data: answers, error: answerError } = questionIds.length
    ? await supabase
        .from("answers")
        .select("session_question_id, selected_option_id")
        .in("session_question_id", questionIds)
    : { data: [], error: null };

  if (answerError) {
    throw new Error(`Jawaban gagal dibaca ${dbDetail(answerError)}.`);
  }

  const answerMap = new Map(
    (answers ?? []).map((row) => [
      String(row.session_question_id),
      row.selected_option_id == null ? null : String(row.selected_option_id),
    ])
  );

  let rawScore = 0;
  let maxScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let blankCount = 0;

  for (const row of questions ?? []) {
    const snapshot = (row.question_snapshot ?? {}) as Snapshot;
    const weight = safeWeight(snapshot.weight);
    const correctOption = snapshot.correct_option_id == null
      ? ""
      : String(snapshot.correct_option_id);
    const selectedOption = answerMap.get(String(row.id)) ?? null;

    maxScore += weight;
    if (!selectedOption) {
      blankCount += 1;
    } else if (correctOption && selectedOption === correctOption) {
      correctCount += 1;
      rawScore += weight;
    } else {
      wrongCount += 1;
    }
  }

  const finalScore = maxScore > 0
    ? Math.round(((rawScore / maxScore) * 100) * 100) / 100
    : 0;

  const result: FinalizedResult = {
    session_id: sessionId,
    raw_score: rawScore,
    max_score: maxScore,
    final_score: finalScore,
    correct_count: correctCount,
    wrong_count: wrongCount,
    blank_count: blankCount,
  };

  const { error: resultError } = await supabase
    .from("results")
    .upsert(result, { onConflict: "session_id" });

  if (resultError) {
    throw new Error(`Hasil ujian gagal disimpan ${dbDetail(resultError)}.`);
  }

  const now = new Date().toISOString();
  const submittedAt = session.submitted_at ? String(session.submitted_at) : now;

  // Keep section lifecycle consistent with the global session. Force submit,
  // hard close, violation auto-submit, and global timeout all terminate any
  // section that has not already been completed.
  const { error: progressCloseError } = await supabase
    .from("exam_section_progress")
    .update({ status: "TIMED_OUT", completed_at: submittedAt, updated_at: now })
    .eq("session_id", sessionId)
    .in("status", ["ACTIVE", "PENDING"]);
  if (progressCloseError && progressCloseError.code !== "42P01") {
    throw new Error(`Progress sesi gagal ditutup ${dbDetail(progressCloseError)}.`);
  }

  const { error: closeError } = await supabase
    .from("exam_sessions")
    .update({
      status: "SUBMITTED",
      submitted_at: submittedAt,
      last_seen_at: now,
      updated_at: now,
    })
    .eq("id", sessionId);

  if (closeError) {
    throw new Error(`Status submit gagal disimpan ${dbDetail(closeError)}.`);
  }

  return result;
}
