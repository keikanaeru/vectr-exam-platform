import ExcelJS from "exceljs";

import { requireAdminExportAccess } from "@/lib/organization-subscription";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeName(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "organisasi";
}

export async function GET() {
  try {
    const { organizationId, organization } = await requireAdminExportAccess();
    const supabase = createAdminClient();

    const [batchResult, candidateResult] = await Promise.all([
      supabase.from("batches").select("id, code, name").eq("organization_id", organizationId),
      supabase.from("candidates").select("id, batch_id, candidate_code, display_name, external_identifier, email, active, created_at").eq("organization_id", organizationId).order("candidate_code"),
    ]);

    if (batchResult.error || candidateResult.error) throw new Error("Gagal membaca data peserta.");
    const batchMap = new Map((batchResult.data ?? []).map((row) => [String(row.id), row]));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "VECTR Exam Platform";
    const sheet = workbook.addWorksheet("Peserta", { views: [{ state: "frozen", ySplit: 5 }] });

    sheet.mergeCells("A1:H1"); sheet.getCell("A1").value = "MASTER DATA PESERTA"; sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF172554" } };
    sheet.mergeCells("A2:H2"); sheet.getCell("A2").value = `Organisasi: ${organization.name}`;
    sheet.mergeCells("A3:H3"); sheet.getCell("A3").value = `Total data: ${(candidateResult.data ?? []).length}`;

    const header = sheet.getRow(5);
    header.values = ["No", "Kode Peserta", "Nama", "NIK / NIM", "Email", "Batch", "Kode Batch", "Status"];
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF172554" } };
    header.alignment = { horizontal: "center", vertical: "middle" };

    (candidateResult.data ?? []).forEach((candidate, index) => {
      const batch = candidate.batch_id ? batchMap.get(String(candidate.batch_id)) : null;
      sheet.addRow([
        index + 1,
        String(candidate.candidate_code),
        String(candidate.display_name),
        candidate.external_identifier ? String(candidate.external_identifier) : "",
        candidate.email ? String(candidate.email) : "",
        batch ? String(batch.name) : "",
        batch ? String(batch.code) : "",
        candidate.active ? "ACTIVE" : "INACTIVE",
      ]);
    });

    sheet.columns = [{ width: 7 }, { width: 18 }, { width: 30 }, { width: 22 }, { width: 34 }, { width: 28 }, { width: 18 }, { width: 14 }];
    sheet.getColumn(2).numFmt = "@";
    sheet.getColumn(4).numFmt = "@";
    sheet.autoFilter = { from: "A5", to: `H${Math.max(5, 5 + (candidateResult.data ?? []).length)}` };
    sheet.eachRow((row) => { row.alignment = { vertical: "middle", wrapText: true }; });

    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="peserta-${safeName(organization.name)}.xlsx"`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("PARTICIPANT EXPORT ERROR", error);
    return new Response("Gagal membuat export peserta.", { status: 500 });
  }
}
