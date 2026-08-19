import ExcelJS from "exceljs";

import { requireAdminWriteAccess } from "@/lib/organization-subscription";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await requireAdminWriteAccess();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VECTR Exam Platform";
  const sheet = workbook.addWorksheet("Peserta", {
    views: [
      {
        state: "frozen",
        ySplit: 1,
      },
    ],
  });

  sheet.columns = [
    {
      header: "Kode Peserta",
      key: "candidate_code",
      width: 20,
    },
    {
      header: "Nama Peserta",
      key: "display_name",
      width: 32,
    },
    {
      header: "NIK / NIM",
      key: "external_identifier",
      width: 24,
    },
    {
      header: "Email",
      key: "email",
      width: 36,
    },
  ];

  const header = sheet.getRow(1);
  header.height = 26;
  header.font = {
    bold: true,
    color: {
      argb: "FFFFFFFF",
    },
  };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {
      argb: "FF172554",
    },
  };
  header.alignment = {
    vertical: "middle",
    horizontal: "center",
  };

  sheet.autoFilter = {
    from: "A1",
    to: "D1",
  };

  sheet.addRow(["", "", "", ""]);
  sheet.getColumn(1).numFmt = "@";
  sheet.getColumn(3).numFmt = "@";

  const example = workbook.addWorksheet("Contoh");
  example.columns = [
    { header: "Kode Peserta", width: 20 },
    { header: "Nama Peserta", width: 32 },
    { header: "NIK / NIM", width: 24 },
    { header: "Email", width: 36 },
  ];
  example.addRow([
    "P-001",
    "Nama Peserta 1",
    "230000001",
    "peserta1@gmail.com",
  ]);
  example.addRow([
    "P-002",
    "Nama Peserta 2",
    "230000002",
    "peserta2@gmail.com",
  ]);
  example.getRow(1).font = {
    bold: true,
    color: { argb: "FFFFFFFF" },
  };
  example.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF172554" },
  };

  const guide = workbook.addWorksheet("Petunjuk");
  guide.columns = [
    {
      header: "Kolom",
      key: "field",
      width: 22,
    },
    {
      header: "Ketentuan",
      key: "rule",
      width: 82,
    },
  ];
  guide.addRows([
    {
      field: "Kode Peserta",
      rule: "WAJIB dan harus unik dalam organisasi. Contoh: P-001.",
    },
    {
      field: "Nama Peserta",
      rule: "WAJIB. Nama yang akan ditampilkan di VECTR Exam Platform.",
    },
    {
      field: "NIK / NIM",
      rule: "Opsional. Disarankan format Text agar angka panjang/leading zero tidak berubah. Nilai ini juga dipakai untuk mendeteksi peserta yang sama saat import.",
    },
    {
      field: "Email",
      rule: "Opsional. Isi bila akan digunakan untuk komunikasi. Email yang sama dianggap peserta yang sama saat import.",
    },
    {
      field: "Import",
      rule: "Isi worksheet Peserta. Jangan mengubah nama dua kolom wajib jika ingin hasil paling aman.",
    },
  ]);
  guide.getRow(1).font = {
    bold: true,
    color: { argb: "FFFFFFFF" },
  };
  guide.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF172554" },
  };
  guide.eachRow((row) => {
    row.alignment = {
      vertical: "top",
      wrapText: true,
    };
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="template-import-peserta.xlsx"',
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
