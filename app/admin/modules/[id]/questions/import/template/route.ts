import ExcelJS from "exceljs";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminWriteAccess } from "@/lib/organization-subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "bank-soal";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: moduleId } = await context.params;
  const { organizationId } = await requireAdminWriteAccess();
  const supabase = createAdminClient();

  const { data: module } = await supabase
    .from("modules")
    .select("id, code, name")
    .eq("id", moduleId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!module) return new Response("Modul tidak ditemukan.", { status: 404 });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VECTR Exam Platform";
  const sheet = workbook.addWorksheet("Soal", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.addRow([
    "Kode Soal",
    "Pertanyaan",
    "Opsi A",
    "Opsi B",
    "Opsi C",
    "Opsi D",
    "Kunci Jawaban",
    "Bobot",
    "Status",
  ]);
  sheet.addRow([
    "Q-001",
    "Contoh pertanyaan. Hapus baris contoh ini sebelum import jika tidak diperlukan.",
    "Pilihan A",
    "Pilihan B",
    "Pilihan C",
    "Pilihan D",
    "A",
    1,
    "ACTIVE",
  ]);

  sheet.columns = [
    { width: 16 },
    { width: 52 },
    { width: 28 },
    { width: 28 },
    { width: 28 },
    { width: 28 },
    { width: 18 },
    { width: 10 },
    { width: 14 },
  ];

  const header = sheet.getRow(1);
  header.height = 28;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF172554" } };
  header.alignment = { vertical: "middle", horizontal: "center" };
  sheet.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });

  const guide = workbook.addWorksheet("Petunjuk");
  guide.addRows([
    ["TEMPLATE IMPORT BANK SOAL"],
    ["Modul", `${module.code} - ${module.name}`],
    [],
    ["Kolom", "Aturan"],
    ["Kode Soal", "Wajib dan unik dalam satu modul. Contoh Q-001."],
    ["Pertanyaan", "Wajib."],
    ["Opsi A-D", "Semua wajib dan isinya harus berbeda."],
    ["Kunci Jawaban", "A, B, C, atau D."],
    ["Bobot", "Opsional. Default 1. Nilai 0–1000."],
    ["Status", "ACTIVE atau INACTIVE. Default ACTIVE."],
    [],
    ["Duplikat", "Saat upload Anda dapat memilih: lewati atau update kode soal yang sudah ada."],
  ]);
  guide.getColumn(1).width = 24;
  guide.getColumn(2).width = 72;
  guide.getRow(1).font = { bold: true, size: 16 };
  guide.getRow(4).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="template-bank-soal-${safeFileName(String(module.code))}.xlsx"`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
