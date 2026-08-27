import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { loadExamResultExportData, formatWib, safeFileName } from "@/lib/exam-result-export";
import { requireAdminExportAccess } from "@/lib/organization-subscription";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safe(value: string) { return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim(); }
function trim(value: string, max: number) { const text = safe(value); return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 3))}...`; }

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: examId } = await context.params;
    const { organizationId, organization } = await requireAdminExportAccess();
    const data = await loadExamResultExportData(createAdminClient(), examId, organizationId, String(organization.name));
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const width = 842, height = 595, margin = 30, rowHeight = 19;
    const sectionLabels = data.sections.map((section) => trim(section.moduleCode, 10));
    const headers = ["No", "Kode", "Nama", "Status", "Nilai Akhir", ...sectionLabels, "Status Ujian"];
    const widths = [28, 70, 142, 72, 58, ...data.sections.map(() => 72), 88];

    const moduleResult = (
      value: number | "" | null | undefined
    ) => {
      if (value === "" || value == null) return "-";
      return `${value} | ${Number(value) >= data.passingScore ? "LULUS" : "TIDAK LULUS"}`;
    };

    const examStatus = (value: string) =>
      value === "LULUS"
        ? "LULUS UJIAN"
        : value === "TIDAK LULUS"
          ? "TIDAK LULUS UJIAN"
          : value || "-";
    const usableScale = Math.min(1, (width - margin * 2) / widths.reduce((a,b) => a+b, 0));
    const scaled = widths.map((value) => value * usableScale);
    let page = pdf.addPage([width, height]);
    let y = height - margin;
    const drawTitle = () => {
      page.drawText("HASIL UJIAN", { x: margin, y, size: 16, font: bold, color: rgb(0.08,0.15,0.25) }); y -= 21;
      page.drawText(trim(data.exam.title, 90), { x: margin, y, size: 11, font: bold }); y -= 15;
      page.drawText(trim(`${data.organizationName} · ${formatWib(data.exam.startsAt)} · Passing per modul ${data.passingScore}`, 120), { x: margin, y, size: 8, font: regular, color: rgb(.35,.4,.48) }); y -= 12;
      page.drawText("Nilai Akhir informatif; kelulusan ditentukan berdasarkan setiap modul.", { x: margin, y, size: 7, font: regular, color: rgb(.35,.4,.48) }); y -= 20;
    };
    const drawHeader = () => {
      let x = margin;
      headers.forEach((header, index) => { page.drawRectangle({ x, y: y-4, width: scaled[index], height: rowHeight, color: rgb(.09,.15,.27) }); page.drawText(trim(header, 16), { x: x+3, y: y+2, size: 6.8, font: bold, color: rgb(1,1,1) }); x += scaled[index]; }); y -= rowHeight;
    };
    drawTitle(); drawHeader();
    data.rows.forEach((row, index) => {
      if (y < margin + rowHeight) { page = pdf.addPage([width,height]); y = height-margin; drawTitle(); drawHeader(); }
      const values = [
        String(index + 1),
        row.code,
        trim(row.name, 28),
        row.sessionStatus,
        row.finalScore === "" ? "-" : String(row.finalScore),
        ...data.sections.map((section) =>
          moduleResult(row.sectionScores[section.id])
        ),
        examStatus(row.passFail),
      ];
      let x = margin;
      values.forEach((value, column) => {
        const firstModuleColumn = 5;
        const lastModuleColumn =
          firstModuleColumn + data.sections.length - 1;

        const isModuleColumn =
          column >= firstModuleColumn &&
          column <= lastModuleColumn;

        const isExamStatusColumn =
          column === values.length - 1;

        const maxChars =
          column === 2
            ? 26
            : isModuleColumn
              ? 18
              : isExamStatusColumn
                ? 20
                : 14;

        const fontSize =
          isModuleColumn || isExamStatusColumn
            ? 6.2
            : 6.8;

        page.drawRectangle({
          x,
          y: y - 4,
          width: scaled[column],
          height: rowHeight,
          borderColor: rgb(.83,.86,.9),
          borderWidth: .4,
        });

        page.drawText(
          trim(String(value), maxChars),
          {
            x: x + 3,
            y: y + 2,
            size: fontSize,
            font: regular,
            color: rgb(.15,.2,.28),
          }
        );

        x += scaled[column];
      });
      y -= rowHeight;
    });
    const bytes = await pdf.save();
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new Response(body, { headers: {
      "Content-Type":"application/pdf",
      "Content-Disposition":`attachment; filename="hasil-${safeFileName(data.exam.title)}.pdf"`,
      "Cache-Control":"private, no-store, max-age=0",
    }});
  } catch (error) {
    console.error("RESULT PDF ERROR", error);
    return new Response("Gagal membuat PDF hasil ujian.", { status: 500 });
  }
}
