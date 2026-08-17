type DatabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

const compatibilityHints: Record<string, string> = {
  "22P02": "State database belum menerima nilai yang dipakai aplikasi. Jalankan file setup database terbaru lalu ulangi.",
  "42501": "Database menolak operasi karena permission/RLS. Pastikan SUPABASE_SECRET_KEY adalah secret/service-role key project yang sama.",
  "23514": "Constraint database menolak nilai yang dipakai aplikasi. Jalankan file setup database terbaru lalu ulangi.",
  "42703": "Kolom database belum sesuai dengan aplikasi. Jalankan file setup database terbaru dan periksa menu Platform.",
  "42P10": "Constraint/index database yang dibutuhkan belum tersedia. Jalankan file setup database terbaru.",
  "42883": "Fungsi database yang dibutuhkan belum tersedia atau bentuknya berbeda. Periksa setup database di menu Platform.",
  "PGRST202": "Fungsi database belum dikenali Data API. Periksa setup database di menu Platform.",
  "PGRST204": "Kolom aplikasi belum dikenali Data API. Jalankan setup database terbaru lalu reload schema cache bila diperlukan.",
};

export function logDatabaseError(operation: string, error: unknown) {
  console.error(`[DB:${operation}]`, error);
}

export function databaseErrorMessage(
  operation: string,
  fallback: string,
  error: unknown
) {
  logDatabaseError(operation, error);

  if (!error || typeof error !== "object") return fallback;

  const row = error as DatabaseErrorLike;
  const code = row.code ? String(row.code) : "DB_ERROR";
  const compatibilityHint = compatibilityHints[code];

  if (process.env.NODE_ENV !== "production" && row.message) {
    const detail = row.details ? ` Detail: ${row.details}` : "";
    const hint = row.hint ? ` Hint: ${row.hint}` : "";
    const remediation = compatibilityHint ? ` ${compatibilityHint}` : "";
    return `${fallback} [${operation} / ${code}] ${row.message}${detail}${hint}${remediation}`;
  }

  return `${fallback} [${operation} / ${code}]${compatibilityHint ? ` ${compatibilityHint}` : ""}`;
}
