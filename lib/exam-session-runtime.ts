import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

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

/**
 * R8.2 database-owned finalization path.
 *
 * Scoring, result upsert, section close, and session close now run in one
 * PostgreSQL transaction. The RPC also row-locks the session so an answer save
 * and a timer/force submit cannot race each other at the deadline boundary.
 */
export async function finalizeExamSession(
  supabase: AdminClient,
  sessionId: string
): Promise<FinalizedResult> {
  const { data, error } = await supabase.rpc("exam_finalize_session_r82", {
    p_session_id: sessionId,
  });

  if (error) {
    throw new Error(`Finalisasi ujian gagal ${dbDetail(error)}.`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("Finalisasi ujian tidak mengembalikan hasil.");
  }

  return {
    session_id: String(row.session_id ?? sessionId),
    raw_score: Number(row.raw_score ?? 0),
    max_score: Number(row.max_score ?? 0),
    final_score: Number(row.final_score ?? 0),
    correct_count: Number(row.correct_count ?? 0),
    wrong_count: Number(row.wrong_count ?? 0),
    blank_count: Number(row.blank_count ?? 0),
  };
}
