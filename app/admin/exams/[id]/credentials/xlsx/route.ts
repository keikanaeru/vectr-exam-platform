import ExcelJS from "exceljs";

import { decryptAccessCode } from "@/lib/access-code-crypto";
import { requireAdminExportAccess } from "@/lib/organization-subscription";
import { createAdminClient } from "@/lib/supabase/admin";

import { getCredentialCoverage } from "@/lib/credential-export-guard";
import { getPublicAppOrigin } from "@/lib/platform-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sanitizeFileName(value: string) {
  const cleaned = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || "ujian";
}

function formatWib(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
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
    const { id: examId } = await context.params;
    const { organizationId, organization } =
      await requireAdminExportAccess();
    const supabase = createAdminClient();

    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, title, starts_at")
      .eq("id", examId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (examError || !exam) {
      return new Response("Ujian tidak ditemukan.", {
        status: 404,
      });
    }

    const { data: assignments, error: assignmentError } =
      await supabase
        .from("exam_assignments")
        .select("candidate_id, access_code_ciphertext")
        .eq("exam_id", examId)
        .eq("active", true);

    if (assignmentError || !assignments?.length) {
      return new Response("Credential peserta belum tersedia.", {
        status: 409,
      });
    }

    const coverage = await getCredentialCoverage(
      supabase,
      organizationId,
      examId,
      assignments.length
    );

    if (!coverage.complete) {
      return new Response(
        `${coverage.missing} peserta batch belum disinkronkan ke ujian. Buka Admin > Ujian > Sinkronkan Peserta, lalu generate kode akses.`,
        { status: 409 }
      );
    }

    if (
      assignments.some(
        (assignment) => !assignment.access_code_ciphertext
      )
    ) {
      return new Response("Belum semua credential berstatus READY.", {
        status: 409,
      });
    }

    const candidateIds = assignments.map((assignment) =>
      String(assignment.candidate_id)
    );

    const { data: candidates, error: candidateError } =
      await supabase
        .from("candidates")
        .select("id, candidate_code, display_name, email")
        .eq("organization_id", organizationId)
        .in("id", candidateIds);

    if (candidateError) {
      throw new Error("Gagal membaca peserta.");
    }

    const candidateMap = new Map(
      (candidates ?? []).map((candidate) => [
        String(candidate.id),
        candidate,
      ])
    );

    const origin = await getPublicAppOrigin();
    const participantLink = `${origin}/join/${exam.id}`;

    const rows = assignments
      .map((assignment) => {
        const candidate = candidateMap.get(
          String(assignment.candidate_id)
        );

        if (!candidate || !assignment.access_code_ciphertext) {
          throw new Error("Data credential peserta tidak lengkap.");
        }

        return {
          candidateCode: String(candidate.candidate_code),
          displayName: String(candidate.display_name),
          email: candidate.email ? String(candidate.email) : "",
          accessCode: decryptAccessCode(
            String(assignment.access_code_ciphertext)
          ),
        };
      })
      .sort((first, second) =>
        first.candidateCode.localeCompare(
          second.candidateCode,
          "id-ID",
          {
            numeric: true,
            sensitivity: "base",
          }
        )
      );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "VECTR Exam Platform";
    workbook.title = `Master Credential - ${exam.title}`;

    const sheet = workbook.addWorksheet("Credential", {
      views: [
        {
          state: "frozen",
          ySplit: 7,
        },
      ],
    });

    sheet.mergeCells("A1:F1");
    sheet.getCell("A1").value = "MASTER CREDENTIAL PESERTA";
    sheet.getCell("A1").font = {
      bold: true,
      size: 16,
      color: { argb: "FF172554" },
    };

    sheet.mergeCells("A2:F2");
    sheet.getCell("A2").value = `Ujian: ${exam.title}`;
    sheet.mergeCells("A3:F3");
    sheet.getCell("A3").value = `Organisasi: ${organization.name}`;
    sheet.mergeCells("A4:F4");
    sheet.getCell("A4").value = `Jadwal: ${formatWib(
      exam.starts_at ? String(exam.starts_at) : null
    )}`;
    sheet.mergeCells("A5:F5");
    sheet.getCell("A5").value = `Participant Link: ${participantLink}`;

    const headerRow = sheet.getRow(7);
    headerRow.values = [
      "No",
      "Nama",
      "Email",
      "Kode Peserta",
      "Kode Akses",
      "Participant Link",
    ];
    headerRow.height = 25;
    headerRow.font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF172554" },
    };
    headerRow.alignment = {
      vertical: "middle",
      horizontal: "center",
    };

    rows.forEach((row, index) => {
      sheet.addRow([
        index + 1,
        row.displayName,
        row.email,
        row.candidateCode,
        row.accessCode,
        participantLink,
      ]);
    });

    sheet.columns = [
      { width: 8 },
      { width: 30 },
      { width: 36 },
      { width: 20 },
      { width: 20 },
      { width: 58 },
    ];

    sheet.autoFilter = {
      from: "A7",
      to: `F${7 + rows.length}`,
    };

    sheet.eachRow((row) => {
      row.alignment = {
        vertical: "middle",
        wrapText: true,
      };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `master-credential-${sanitizeFileName(
      String(exam.title)
    )}.xlsx`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("MASTER CREDENTIAL XLSX ERROR:", error);

    return new Response("Gagal membuat Master Credential Excel.", {
      status: 500,
    });
  }
}
