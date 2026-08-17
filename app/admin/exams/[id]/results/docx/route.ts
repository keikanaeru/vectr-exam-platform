import { AlignmentType, Document, Packer, PageOrientation, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";

import { loadExamResultExportData, formatWib, safeFileName } from "@/lib/exam-result-export";
import { requireAdminExportAccess } from "@/lib/organization-subscription";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cell(text: string, bold = false) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold, size: 16, font: "Arial" })] })],
    margins: { top: 70, bottom: 70, left: 80, right: 80 },
  });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: examId } = await context.params;
    const { organizationId, organization } = await requireAdminExportAccess();
    const data = await loadExamResultExportData(createAdminClient(), examId, organizationId, String(organization.name));
    const headers = ["No", "Kode", "Nama", "Status", "Nilai", "Kelulusan", ...data.sections.map((section) => section.moduleCode)];
    const rows = data.rows.map((row, index) => new TableRow({ children: [
      cell(String(index + 1)), cell(row.code), cell(row.name), cell(row.sessionStatus), cell(row.finalScore === "" ? "-" : String(row.finalScore)), cell(row.passFail || "-"),
      ...data.sections.map((section) => cell(row.sectionScores[section.id] === "" || row.sectionScores[section.id] == null ? "-" : String(row.sectionScores[section.id]))),
    ] }));
    const doc = new Document({ sections: [{ properties: { page: { size: { width: 16838, height: 11906, orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "HASIL UJIAN", bold: true, size: 30, font: "Arial" })] }),
      new Paragraph({ children: [new TextRun({ text: data.exam.title, bold: true, size: 22, font: "Arial" })] }),
      new Paragraph({ children: [new TextRun({ text: `${data.organizationName} · ${formatWib(data.exam.startsAt)}`, size: 18, font: "Arial" })] }),
      new Paragraph({ children: [new TextRun({ text: `Passing score: ${data.passingScore} · Peserta: ${data.rows.length}`, size: 18, font: "Arial" })] }),
      new Paragraph({ text: "" }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: headers.map((value) => cell(value, true)) }), ...rows] }),
    ] }] });
    const buffer = await Packer.toBuffer(doc);
    return new Response(new Uint8Array(buffer), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="hasil-${safeFileName(data.exam.title)}.docx"`,
      "Cache-Control": "private, no-store, max-age=0",
    } });
  } catch (error) {
    console.error("RESULT DOCX ERROR", error);
    return new Response("Gagal membuat Word hasil ujian.", { status: 500 });
  }
}
