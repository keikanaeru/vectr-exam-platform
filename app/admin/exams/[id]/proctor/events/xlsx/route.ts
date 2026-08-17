import ExcelJS from "exceljs";

import { VIOLATION_LABELS, type ViolationKind } from "@/lib/exam-policy";
import { requireAdminExportAccess } from "@/lib/organization-subscription";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fileName(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "ujian";
}

function formatWib(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "medium" }).format(new Date(value));
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: examId } = await context.params;
    const { organizationId, organization } = await requireAdminExportAccess();
    const supabase = createAdminClient();

    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id, title")
      .eq("id", examId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (examError || !exam) return new Response("Ujian tidak ditemukan.", { status: 404 });

    const { data: events, error: eventError } = await supabase
      .from("proctor_events")
      .select("id, session_id, candidate_id, event_type, severity, policy_action, counted, detail, client_event_at, created_at")
      .eq("exam_id", examId)
      .order("created_at", { ascending: true });

    if (eventError) {
      return new Response("Proctoring belum siap. Jalankan FINAL_SETUP.sql.", { status: 409 });
    }

    const candidateIds = [...new Set((events ?? []).map((event) => String(event.candidate_id)))];
    const { data: candidates, error: candidateError } = candidateIds.length
      ? await supabase.from("candidates").select("id, candidate_code, display_name, external_identifier, email").in("id", candidateIds)
      : { data: [], error: null };
    if (candidateError) throw new Error("Gagal membaca peserta audit.");

    const candidateMap = new Map((candidates ?? []).map((row) => [String(row.id), row]));
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "VECTR Exam Platform";
    const sheet = workbook.addWorksheet("Proctor Audit", { views: [{ state: "frozen", ySplit: 7 }] });

    sheet.mergeCells("A1:M1");
    sheet.getCell("A1").value = "PROCTORING AUDIT LOG";
    sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF172554" } };
    sheet.mergeCells("A2:M2"); sheet.getCell("A2").value = `Ujian: ${exam.title}`;
    sheet.mergeCells("A3:M3"); sheet.getCell("A3").value = `Organisasi: ${organization.name}`;
    sheet.mergeCells("A4:M4"); sheet.getCell("A4").value = `Total event: ${(events ?? []).length}`;
    sheet.mergeCells("A5:M5"); sheet.getCell("A5").value = "Catatan: screenshot OS/perangkat kedua tidak dapat dideteksi browser secara 100%. PrintScreen hanya best-effort.";

    const header = sheet.getRow(7);
    header.values = ["No", "Server Time WIB", "Client Time WIB", "Kode Peserta", "Nama", "NIK / NIM", "Email", "Event", "Severity", "Punishment Saat Event", "Counted", "Session ID", "Detail"];
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF172554" } };
    header.alignment = { horizontal: "center", vertical: "middle" };

    (events ?? []).forEach((event, index) => {
      const candidate = candidateMap.get(String(event.candidate_id));
      const type = String(event.event_type) as ViolationKind;
      sheet.addRow([
        index + 1,
        formatWib(event.created_at ? String(event.created_at) : null),
        formatWib(event.client_event_at ? String(event.client_event_at) : null),
        candidate?.candidate_code ? String(candidate.candidate_code) : "-",
        candidate?.display_name ? String(candidate.display_name) : "-",
        candidate?.external_identifier ? String(candidate.external_identifier) : "",
        candidate?.email ? String(candidate.email) : "",
        VIOLATION_LABELS[type] ?? type,
        event.severity ? String(event.severity) : "WARNING",
        event.policy_action ? String(event.policy_action) : "LEGACY",
        typeof event.counted === "boolean" ? (event.counted ? "YES" : "NO") : "LEGACY",
        String(event.session_id),
        JSON.stringify(event.detail ?? {}),
      ]);
    });

    sheet.columns = [
      { width: 7 }, { width: 24 }, { width: 24 }, { width: 18 }, { width: 28 }, { width: 20 },
      { width: 32 }, { width: 34 }, { width: 12 }, { width: 20 }, { width: 12 }, { width: 38 }, { width: 60 },
    ];
    sheet.autoFilter = { from: "A7", to: `M${Math.max(7, 7 + (events ?? []).length)}` };
    sheet.eachRow((row) => { row.alignment = { vertical: "middle", wrapText: true }; });

    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="proctor-audit-${fileName(String(exam.title))}.xlsx"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("PROCTOR AUDIT XLSX ERROR", error);
    return new Response("Gagal membuat export audit proctoring.", { status: 500 });
  }
}
