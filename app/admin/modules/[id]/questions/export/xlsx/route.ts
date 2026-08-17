import ExcelJS from "exceljs";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminExportAccess } from "@/lib/organization-subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OptionItem = { id: string; text: string };

function readOptions(value: unknown): OptionItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { id?: unknown; text?: unknown };
      return typeof row.id === "string" && typeof row.text === "string"
        ? { id: row.id.toUpperCase(), text: row.text }
        : null;
    })
    .filter((item): item is OptionItem => Boolean(item));
}

function safeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "bank-soal";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: moduleId } = await context.params;
  const { organizationId, organization } = await requireAdminExportAccess();
  const supabase = createAdminClient();

  const { data: module } = await supabase
    .from("modules")
    .select("id, code, name")
    .eq("id", moduleId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!module) return new Response("Modul tidak ditemukan.", { status: 404 });

  const { data: questions, error } = await supabase
    .from("questions")
    .select("code, question_text, options, correct_option_id, weight, status, created_at")
    .eq("module_id", moduleId)
    .order("created_at", { ascending: true });

  if (error) return new Response("Gagal membaca bank soal.", { status: 500 });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VECTR Exam Platform";
  workbook.title = `Bank Soal - ${module.name}`;
  const sheet = workbook.addWorksheet("Bank Soal", { views: [{ state: "frozen", ySplit: 5 }] });

  sheet.mergeCells("A1:I1");
  sheet.getCell("A1").value = `BANK SOAL — ${module.name}`;
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF0F172A" } };
  sheet.mergeCells("A2:I2");
  sheet.getCell("A2").value = `${organization.name} · ${module.code}`;
  sheet.getCell("A2").font = { color: { argb: "FF64748B" } };
  sheet.mergeCells("A3:I3");
  sheet.getCell("A3").value = `Total soal: ${questions?.length ?? 0}`;
  sheet.getCell("A3").font = { color: { argb: "FF64748B" } };

  const header = sheet.getRow(5);
  header.values = ["Kode Soal", "Pertanyaan", "Opsi A", "Opsi B", "Opsi C", "Opsi D", "Kunci Jawaban", "Bobot", "Status"];
  header.height = 28;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF172554" } };
  header.alignment = { vertical: "middle", horizontal: "center" };

  for (const question of questions ?? []) {
    const optionMap = new Map(readOptions(question.options).map((item) => [item.id, item.text]));
    sheet.addRow([
      question.code,
      question.question_text,
      optionMap.get("A") ?? "",
      optionMap.get("B") ?? "",
      optionMap.get("C") ?? "",
      optionMap.get("D") ?? "",
      question.correct_option_id,
      question.weight,
      question.status,
    ]);
  }

  sheet.columns = [
    { width: 16 }, { width: 52 }, { width: 28 }, { width: 28 }, { width: 28 }, { width: 28 }, { width: 18 }, { width: 10 }, { width: 14 },
  ];
  sheet.autoFilter = { from: "A5", to: `I${Math.max(5, 5 + (questions?.length ?? 0))}` };
  sheet.eachRow((row) => { row.alignment = { vertical: "top", wrapText: true }; });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bank-soal-${safeFileName(String(module.code))}.xlsx"`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
