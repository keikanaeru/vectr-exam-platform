"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  createCandidateSessionToken,
} from "@/lib/candidate-session";
import { getOrganizationSubscriptionState } from "@/lib/organization-subscription";
import {
  checkCandidateLoginRateLimit,
  clearCandidateLoginFailures,
  formatRateLimitMessage,
  registerCandidateLoginFailure,
} from "@/lib/candidate-login-rate-limit";


export type JoinState = {
  error: string;
};


// =====================================
// LOGIN PESERTA UNTUK UJIAN TERTENTU
// =====================================

export async function loginCandidateForExam(
  examId: string,
  _previousState: JoinState,
  formData: FormData
): Promise<JoinState> {
  const supabase =
    createAdminClient();


  // =====================================
  // INPUT
  // =====================================

  const candidateCode =
    String(
      formData.get(
        "candidate_code"
      ) || ""
    )
      .trim()
      .toUpperCase();


  const accessCode =
    String(
      formData.get(
        "access_code"
      ) || ""
    ).trim().toUpperCase();


  if (
    !candidateCode ||
    !accessCode
  ) {
    return {
      error:
        "Kode peserta dan kode akses wajib diisi.",
    };
  }


  if (!examId) {
    return {
      error:
        "Link ujian tidak valid.",
    };
  }


  // =====================================
  // CARI UJIAN DARI SHARE LINK
  // =====================================

  const {
    data: exam,
    error: examError,
  } =
    await supabase
      .from("exams")
      .select(
        `
        id,
        organization_id,
        title,
        status,
        login_open_at,
        starts_at,
        hard_close_at,
        duration_minutes
        `
      )
      .eq(
        "id",
        examId
      )
      .maybeSingle();


  if (examError) {
    console.error(
      "JOIN EXAM QUERY ERROR:",
      examError
    );

    return {
      error:
        "Gagal membaca data ujian. Silakan coba lagi.",
    };
  }


  if (!exam) {
    return {
      error:
        "Ujian dari link ini tidak ditemukan.",
    };
  }


  if (!["ACTIVE", "CLOSED"].includes(String(exam.status))) {
    return {
      error:
        "Ujian ini belum aktif atau sudah tidak tersedia.",
    };
  }


  // =====================================
  // VALIDASI JADWAL
  // =====================================

  if (
    !exam.login_open_at ||
    !exam.hard_close_at
  ) {
    return {
      error:
        "Jadwal ujian belum lengkap. Hubungi penyelenggara.",
    };
  }


  const loginOpenMs =
    new Date(
      exam.login_open_at
    ).getTime();


  const hardCloseMs =
    new Date(
      exam.hard_close_at
    ).getTime();


  if (
    Number.isNaN(
      loginOpenMs
    ) ||
    Number.isNaN(
      hardCloseMs
    )
  ) {
    return {
      error:
        "Jadwal ujian tidak valid. Hubungi penyelenggara.",
    };
  }


  const now =
    Date.now();


  if (
    now <
    loginOpenMs
  ) {
    return {
      error:
        "Login untuk ujian ini belum dibuka.",
    };
  }


  if (
    now >=
    hardCloseMs
  ) {
    return {
      error:
        "Waktu login untuk ujian ini sudah ditutup.",
    };
  }


  const rateScope = `EXAM:${examId}:${candidateCode}`;
  const rateLimit = await checkCandidateLoginRateLimit(rateScope);
  if (!rateLimit.allowed) {
    return { error: formatRateLimitMessage(rateLimit.retryAfterSeconds) };
  }

  // =====================================
  // CARI PESERTA
  //
  // PENTING:
  // Kandidat dibatasi ke organisasi
  // pemilik ujian.
  //
  // Jadi candidate code yang sama
  // dari organisasi lain tidak bisa
  // ikut ujian ini.
  // =====================================

  const {
    data: candidates,
    error: candidateError,
  } =
    await supabase
      .from("candidates")
      .select(
        `
        id,
        candidate_code,
        display_name,
        batch_id,
        organization_id,
        active
        `
      )
      .eq(
        "organization_id",
        exam.organization_id
      )
      .eq(
        "candidate_code",
        candidateCode
      )
      .eq(
        "active",
        true
      );


  if (candidateError) {
    console.error(
      "JOIN CANDIDATE QUERY ERROR:",
      candidateError
    );

    return {
      error:
        "Gagal membaca data peserta. Silakan coba lagi.",
    };
  }


  if (
    !candidates ||
    candidates.length === 0
  ) {
    await registerCandidateLoginFailure(rateScope);
    return {
      error:
        `Kode peserta ${candidateCode} tidak terdaftar pada organisasi ujian ini.`,
    };
  }


  const candidateIds =
    candidates.map(
      (candidate) =>
        candidate.id
    );


  // =====================================
  // CARI ASSIGNMENT
  //
  // Assignment harus:
  // - exam yang ada di link
  // - candidate yang ditemukan
  // - masih aktif
  // - sudah punya access code
  // =====================================

  const {
    data: assignments,
    error: assignmentError,
  } =
    await supabase
      .from(
        "exam_assignments"
      )
      .select(
        `
        id,
        exam_id,
        candidate_id,
        access_code_hash,
        extra_time_minutes,
        active
        `
      )
      .eq(
        "exam_id",
        exam.id
      )
      .in(
        "candidate_id",
        candidateIds
      )
      .eq(
        "active",
        true
      )
      .not(
        "access_code_hash",
        "is",
        null
      );


  if (assignmentError) {
    console.error(
      "JOIN ASSIGNMENT QUERY ERROR:",
      assignmentError
    );

    return {
      error:
        "Gagal membaca akses ujian peserta. Silakan coba lagi.",
    };
  }


  if (
    !assignments ||
    assignments.length === 0
  ) {
    return {
      error:
        "Kode peserta ditemukan, tetapi peserta tidak terdaftar pada ujian ini.",
    };
  }


  // =====================================
  // CEK KODE AKSES
  // =====================================

  const bcrypt =
    await import(
      "bcryptjs"
    );


  let matchedAssignment:
    | (typeof assignments)[number]
    | null =
    null;


  for (
    const assignment
    of assignments
  ) {
    if (
      !assignment.access_code_hash
    ) {
      continue;
    }


    const valid =
      await bcrypt.default.compare(
        accessCode,
        assignment.access_code_hash
      );


    if (valid) {
      matchedAssignment =
        assignment;

      break;
    }
  }


  if (
    !matchedAssignment
  ) {
    await registerCandidateLoginFailure(rateScope);
    return {
      error:
        "Kode akses salah.",
    };
  }


  // =====================================
  // FINAL VALIDATION
  // =====================================

  const candidate =
    candidates.find(
      (item) =>
        item.id ===
        matchedAssignment.candidate_id
    );


  if (!candidate) {
    return {
      error:
        "Data peserta tidak valid.",
    };
  }

  const { data: activeSession, error: activeSessionError } = await supabase
    .from("exam_sessions")
    .select("id")
    .eq("assignment_id", matchedAssignment.id)
    .eq("status", "ACTIVE")
    .order("attempt_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeSessionError) {
    console.error("JOIN ACTIVE SESSION ERROR:", activeSessionError);
    return { error: "Gagal memeriksa sesi aktif. Silakan coba lagi." };
  }

  const subscription = await getOrganizationSubscriptionState(
    supabase,
    String(exam.organization_id)
  );

  // Expiry tidak memutus sesi yang sudah berjalan. Namun sesi baru tidak dapat
  // dimulai setelah organisasi masuk mode export-only/suspended/retention-ended.
  if (!activeSession && !subscription.canCandidateStart) {
    return {
      error: "Penyelenggara sedang tidak menerima sesi ujian baru. Hubungi penyelenggara untuk informasi lebih lanjut.",
    };
  }

  if (String(exam.status) === "CLOSED" && !activeSession) {
    return { error: "Login baru untuk ujian ini sudah ditutup." };
  }


  await clearCandidateLoginFailures(rateScope);

  // =====================================
  // CANDIDATE SESSION COOKIE
  // =====================================

  const twelveHours =
    60 *
    60 *
    12;


  const expiresAt =
    Math.floor(
      Date.now() /
        1000
    ) +
    twelveHours;


  const token =
    createCandidateSessionToken({
      assignmentId:
        matchedAssignment.id,

      candidateId:
        candidate.id,

      examId:
        exam.id,

      exp:
        expiresAt,
    });


  const cookieStore =
    await cookies();


  cookieStore.set(
    "candidate_session",
    token,
    {
      httpOnly:
        true,

      secure:
        process.env.NODE_ENV ===
        "production",

      sameSite:
        "lax",

      path:
        "/",

      expires:
        new Date(
          expiresAt *
            1000
        ),
    }
  );


  // =====================================
  // LOGIN BERHASIL
  //
  // Karena user datang dari share link,
  // langsung arahkan ke preparation
  // ujian tersebut.
  // =====================================

  redirect(
    `/candidate/exam/${exam.id}`
  );
}