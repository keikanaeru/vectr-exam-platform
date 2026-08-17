import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminExportAccess } from "@/lib/organization-subscription";
import { decryptAccessCode } from "@/lib/access-code-crypto";

import { getCredentialCoverage } from "@/lib/credential-export-guard";
import { getPublicAppOrigin } from "@/lib/platform-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CandidateRow = {
  id: string;
  candidate_code: string;
  display_name: string;
  email: string | null;
};

function sanitizeFileName(value: string) {
  const cleaned = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || "ujian";
}

function csvCell(value: string | number) {
  const text = String(value).replace(
    /"/g,
    '""'
  );

  return `"${text}"`;
}

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const { id: examId } =
      await context.params;

    if (!examId) {
      return new Response(
        "Exam ID tidak valid.",
        {
          status: 400,
        }
      );
    }

    const { organizationId } =
      await requireAdminExportAccess();

    const supabase =
      createAdminClient();

    const {
      data: exam,
      error: examError,
    } = await supabase
      .from("exams")
      .select("id, title")
      .eq("id", examId)
      .eq(
        "organization_id",
        organizationId
      )
      .maybeSingle();

    if (examError) {
      console.error(
        "CSV CREDENTIAL EXAM ERROR:",
        examError
      );

      return new Response(
        "Gagal membaca data ujian.",
        {
          status: 500,
        }
      );
    }

    if (!exam) {
      return new Response(
        "Ujian tidak ditemukan.",
        {
          status: 404,
        }
      );
    }

    const {
      data: assignments,
      error: assignmentError,
    } = await supabase
      .from("exam_assignments")
      .select(
        "candidate_id, access_code_ciphertext"
      )
      .eq("exam_id", examId)
      .eq("active", true);

    if (assignmentError) {
      console.error(
        "CSV CREDENTIAL ASSIGNMENT ERROR:",
        assignmentError
      );

      return new Response(
        "Gagal membaca credential peserta.",
        {
          status: 500,
        }
      );
    }

    if (!assignments?.length) {
      return new Response(
        "Ujian belum memiliki peserta aktif.",
        {
          status: 409,
        }
      );
    }

    const coverage = await getCredentialCoverage(
      supabase,
      organizationId,
      examId,
      assignments.length
    );

    if (!coverage.complete) {
      return new Response(
        `${coverage.missing} peserta batch belum disinkronkan ke ujian. Sinkronkan peserta dan generate kode akses terlebih dahulu.`,
        { status: 409 }
      );
    }

    if (
      assignments.some(
        (assignment) =>
          !assignment.access_code_ciphertext
      )
    ) {
      return new Response(
        "Belum semua peserta memiliki credential.",
        {
          status: 409,
        }
      );
    }

    const candidateIds =
      assignments.map(
        (assignment) =>
          String(
            assignment.candidate_id
          )
      );

    const {
      data: candidateRows,
      error: candidateError,
    } = await supabase
      .from("candidates")
      .select(
        "id, candidate_code, display_name, email"
      )
      .eq(
        "organization_id",
        organizationId
      )
      .in("id", candidateIds);

    if (candidateError) {
      console.error(
        "CSV CREDENTIAL CANDIDATE ERROR:",
        candidateError
      );

      return new Response(
        "Gagal membaca data peserta.",
        {
          status: 500,
        }
      );
    }

    const candidates: CandidateRow[] =
      (candidateRows ?? []).map(
        (candidate) => ({
          id: String(candidate.id),
          candidate_code: String(
            candidate.candidate_code
          ),
          display_name: String(
            candidate.display_name
          ),
          email: candidate.email
            ? String(candidate.email)
            : null,
        })
      );

    const candidateMap = new Map(
      candidates.map((candidate) => [
        candidate.id,
        candidate,
      ])
    );

    const origin = await getPublicAppOrigin();

    const participantLink =
      `${origin}/join/${exam.id}`;

    const rows = assignments
      .map((assignment) => {
        const candidate =
          candidateMap.get(
            String(
              assignment.candidate_id
            )
          );

        if (!candidate) {
          throw new Error(
            `Candidate tidak ditemukan: ${assignment.candidate_id}`
          );
        }

        if (
          !assignment.access_code_ciphertext
        ) {
          throw new Error(
            `Credential tidak tersedia: ${assignment.candidate_id}`
          );
        }

        return {
          candidate,
          accessCode:
            decryptAccessCode(
              String(
                assignment.access_code_ciphertext
              )
            ),
        };
      })
      .sort((first, second) =>
        first.candidate.candidate_code.localeCompare(
          second.candidate.candidate_code,
          "id-ID",
          {
            numeric: true,
            sensitivity: "base",
          }
        )
      );

    const header = [
      "No",
      "Nama",
      "Email",
      "Kode Peserta",
      "Kode Akses",
      "Participant Link",
    ]
      .map(csvCell)
      .join(",");

    const body = rows.map(
      (row, index) =>
        [
          index + 1,
          row.candidate.display_name,
          row.candidate.email ?? "",
          row.candidate.candidate_code,
          row.accessCode,
          participantLink,
        ]
          .map(csvCell)
          .join(",")
    );

    const csv =
      `\uFEFF${[
        header,
        ...body,
      ].join("\r\n")}`;

    const fileName =
      `master-credential-${sanitizeFileName(
        String(exam.title)
      )}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type":
          "text/csv; charset=utf-8",
        "Content-Disposition":
          `attachment; filename="${fileName}"`,
        "Cache-Control":
          "private, no-store, max-age=0",
        "X-Content-Type-Options":
          "nosniff",
      },
    });
  } catch (error) {
    console.error(
      "MASTER CREDENTIAL CSV ERROR:",
      error
    );

    return new Response(
      "Gagal membuat Master Credential CSV.",
      {
        status: 500,
      }
    );
  }
}
