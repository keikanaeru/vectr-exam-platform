"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  createCandidateSessionToken,
} from "@/lib/candidate-session";
import { getOrganizationSubscriptionStates } from "@/lib/organization-subscription";
import {
  checkCandidateLoginRateLimit,
  clearCandidateLoginFailures,
  formatRateLimitMessage,
  registerCandidateLoginFailure,
} from "@/lib/candidate-login-rate-limit";


export type LoginState = {
  error: string;
};


export async function loginCandidate(
  _previousState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const supabase =
    createAdminClient();


  // =====================================
  // INPUT
  // =====================================

  const candidateCode = String(
    formData.get("candidate_code") || ""
  )
    .trim()
    .toUpperCase();

  const accessCode = String(
    formData.get("access_code") || ""
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

  const rateScope = `GLOBAL:${candidateCode}`;
  const rateLimit = await checkCandidateLoginRateLimit(rateScope);
  if (!rateLimit.allowed) {
    return { error: formatRateLimitMessage(rateLimit.retryAfterSeconds) };
  }


  // =====================================
  // CARI PESERTA
  // =====================================

  const {
    data: candidates,
    error: candidateError,
  } = await supabase
    .from("candidates")
    .select(`
      id,
      candidate_code,
      display_name,
      batch_id,
      active
    `)
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
      "CANDIDATE QUERY ERROR:",
      candidateError
    );

    return {
      error:
        "Gagal membaca data peserta. Cek terminal server.",
    };
  }


  if (
    !candidates ||
    candidates.length === 0
  ) {
    await registerCandidateLoginFailure(rateScope);
    return {
      error:
        `Kode peserta ${candidateCode} tidak ditemukan.`,
    };
  }


  const candidateIds =
    candidates.map(
      (candidate) =>
        candidate.id
    );


  // =====================================
  // CARI ASSIGNMENT UJIAN
  // =====================================

  const {
    data: assignments,
    error: assignmentError,
  } = await supabase
    .from("exam_assignments")
    .select(`
      id,
      exam_id,
      candidate_id,
      access_code_hash,
      extra_time_minutes,
      active
    `)
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
      "ASSIGNMENT QUERY ERROR:",
      assignmentError
    );

    return {
      error:
        "Gagal membaca data ujian peserta. Cek terminal server.",
    };
  }


  if (
    !assignments ||
    assignments.length === 0
  ) {
    return {
      error:
        "Peserta ditemukan, tetapi belum memiliki ujian dengan kode akses.",
    };
  }


  // =====================================
  // CARI UJIAN ACTIVE
  // =====================================

  const examIds = [
    ...new Set(
      assignments.map(
        (assignment) =>
          assignment.exam_id
      )
    ),
  ];


  const {
    data: exams,
    error: examError,
  } = await supabase
    .from("exams")
    .select(`
      id,
      organization_id,
      title,
      status,
      login_open_at,
      starts_at,
      hard_close_at,
      duration_minutes
    `)
    .in(
      "id",
      examIds
    )
    .in(
      "status",
      ["ACTIVE", "CLOSED"]
    );


  if (examError) {
    console.error(
      "EXAM QUERY ERROR:",
      examError
    );

    return {
      error:
        "Gagal membaca data ujian. Cek terminal server.",
    };
  }


  if (
    !exams ||
    exams.length === 0
  ) {
    return {
      error:
        "Peserta ditemukan, tetapi tidak ada ujian yang aktif atau dapat di-resume.",
    };
  }


  const examMap =
    new Map(
      exams.map(
        (exam) => [
          exam.id,
          exam,
        ]
      )
    );

  const assignmentIds = assignments.map((assignment) => assignment.id);
  const { data: activeSessionRows, error: activeSessionError } = assignmentIds.length
    ? await supabase
        .from("exam_sessions")
        .select("assignment_id")
        .in("assignment_id", assignmentIds)
        .eq("status", "ACTIVE")
    : { data: [], error: null };

  if (activeSessionError) {
    console.error("ACTIVE SESSION LOGIN QUERY ERROR:", activeSessionError);
    return { error: "Gagal memeriksa sesi ujian aktif. Silakan coba lagi." };
  }

  const activeAssignmentIds = new Set((activeSessionRows ?? []).map((row) => String(row.assignment_id)));

  const subscriptionStates = await getOrganizationSubscriptionStates(
    supabase,
    (exams ?? []).map((exam) => String(exam.organization_id ?? "")).filter(Boolean)
  );

  const now =
    Date.now();


  // =====================================
  // FILTER JADWAL LOGIN
  // =====================================

  const eligibleAssignments =
    assignments
      .filter(
        (assignment) => {
          const exam =
            examMap.get(
              assignment.exam_id
            );

          if (!exam) {
            return false;
          }


          if (
            !exam.login_open_at ||
            !exam.hard_close_at
          ) {
            return false;
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
            return false;
          }


          const loginWindowOpen = now >= loginOpenMs && now < hardCloseMs;
          if (!loginWindowOpen) return false;

          const hasActiveSession = activeAssignmentIds.has(String(assignment.id));
          const subscription = subscriptionStates.get(String(exam.organization_id ?? ""));
          if (!hasActiveSession && subscription && !subscription.canCandidateStart) {
            return false;
          }
          if (!hasActiveSession && !subscription) {
            return false;
          }

          if (String(exam.status) === "CLOSED") {
            return hasActiveSession;
          }

          return true;
        }
      )
      .sort(
        (a, b) => {
          const examA =
            examMap.get(
              a.exam_id
            );

          const examB =
            examMap.get(
              b.exam_id
            );


          const startA =
            examA?.starts_at
              ? new Date(
                  examA.starts_at
                ).getTime()
              : 0;


          const startB =
            examB?.starts_at
              ? new Date(
                  examB.starts_at
                ).getTime()
              : 0;


          return (
            startA -
            startB
          );
        }
      );


  if (
    eligibleAssignments.length ===
    0
  ) {
    return {
      error:
        "Tidak ada ujian yang sedang membuka login.",
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
    | (typeof eligibleAssignments)[number]
    | null = null;


  for (
    const assignment
    of eligibleAssignments
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


  if (!matchedAssignment) {
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


  const exam =
    examMap.get(
      matchedAssignment.exam_id
    );


  if (
    !candidate ||
    !exam
  ) {
    return {
      error:
        "Data peserta atau ujian tidak valid.",
    };
  }


  await clearCandidateLoginFailures(rateScope);

  // =====================================
  // COOKIE SESSION
  // =====================================
  //
  // PENTING:
  //
  // Cookie peserta JANGAN expire tepat
  // saat hard close.
  //
  // Ketika timer mencapai 00:00,
  // browser masih perlu memanggil server
  // untuk proses auto-submit.
  //
  // Hak mengerjakan tetap dikontrol oleh:
  //
  // - exam_sessions.deadline_at
  // - exam.hard_close_at
  // - status session
  //
  // Cookie hanya berfungsi sebagai
  // identitas peserta.
  // =====================================


  const twelveHours =
    60 * 60 * 12;


  const expiresAt =
    Math.floor(
      Date.now() / 1000
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
      httpOnly: true,

      secure:
        process.env.NODE_ENV ===
        "production",

      sameSite:
        "lax",

      path:
        "/",

      expires:
        new Date(
          expiresAt * 1000
        ),
    }
  );


  // =====================================
  // LOGIN BERHASIL
  // =====================================

  redirect(
    "/candidate"
  );
}