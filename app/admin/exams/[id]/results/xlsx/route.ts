import ExcelJS from "exceljs";

import { loadExamResultExportData, formatWib, safeFileName } from "@/lib/exam-result-export";
import { requireAdminExportAccess } from "@/lib/organization-subscription";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: examId } = await context.params;
    const { organizationId, organization } = await requireAdminExportAccess();
    const supabase = createAdminClient();
    const data = await loadExamResultExportData(supabase, examId, organizationId, String(organization.name));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "VECTR Exam Platform";
    const sheet = workbook.addWorksheet("Hasil Ujian", { views: [{ state: "frozen", ySplit: 7 }] });
    const fixedColumns = 13;
    const totalColumns = fixedColumns + data.sections.length;
    const lastLetter = sheet.getColumn(totalColumns).letter;

    sheet.mergeCells(`A1:${lastLetter}1`); sheet.getCell("A1").value = "HASIL UJIAN"; sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF172554" } };
    sheet.mergeCells(`A2:${lastLetter}2`); sheet.getCell("A2").value = `Ujian: ${data.exam.title}`;
    sheet.mergeCells(`A3:${lastLetter}3`); sheet.getCell("A3").value = `Organisasi: ${data.organizationName}`;
    sheet.mergeCells(`A4:${lastLetter}4`); sheet.getCell("A4").value = `Jadwal: ${formatWib(data.exam.startsAt)}`;
    sheet.mergeCells(`A5:${lastLetter}5`); sheet.getCell("A5").value = `Total peserta: ${data.rows.length} · Passing per modul: ${data.passingScore}`;
    sheet.mergeCells(`A6:${lastLetter}6`);
    sheet.getCell("A6").value = "Nilai Akhir bersifat informatif. Kelulusan ditentukan berdasarkan nilai setiap modul.";
    sheet.getCell("A6").font = { italic: true, color: { argb: "FF64748B" } };

    const moduleResult = (
      value: number | "" | null | undefined
    ) => {
      if (value === "" || value == null) return "";
      return `${value} | ${Number(value) >= data.passingScore ? "LULUS" : "TIDAK LULUS"}`;
    };

    const examStatus = (value: string) =>
      value === "LULUS"
        ? "LULUS UJIAN"
        : value === "TIDAK LULUS"
          ? "TIDAK LULUS UJIAN"
          : value || "";

    const header = sheet.getRow(7);
    header.values = [
      "No", "Kode Peserta", "Nama", "NIK / NIM", "Email", "Status", "Submit", "Benar", "Salah", "Kosong", "Raw / Max", "Nilai Akhir",
      ...data.sections.map((section) => `Nilai / Status ${section.moduleCode} - ${section.moduleName}`),
      "Status Ujian",
    ];
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF172554" } };
    header.alignment = { horizontal: "center", vertical: "middle" };
    header.height = 30;

    data.rows.forEach((row, index) => {
      sheet.addRow([
        index + 1, row.code, row.name, row.identifier, row.email, row.sessionStatus, row.submittedAt,
        row.correct, row.wrong, row.blank, row.rawScore === "" ? "" : `${row.rawScore} / ${row.maxScore}`, row.finalScore,
        ...data.sections.map((section) =>
          moduleResult(row.sectionScores[section.id])
        ),
        examStatus(row.passFail),
      ]);
    });

    const widths = [
      7, 18, 28, 20, 32, 18, 24, 10, 10, 10, 16, 14,
      ...data.sections.map(() => 26),
      22,
    ];
    widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
    sheet.autoFilter = { from: "A7", to: `${lastLetter}${Math.max(7, 7 + data.rows.length)}` };
    sheet.eachRow((row) => { row.alignment = { vertical: "middle", wrapText: true }; });

    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="hasil-${safeFileName(data.exam.title)}.xlsx"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("RESULT XLSX ERROR", error);
    return new Response("Gagal membuat export hasil ujian.", { status: 500 });
  }
}
