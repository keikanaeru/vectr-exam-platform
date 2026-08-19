import fs from "node:fs";
import path from "node:path";

const files = [
  "app/admin/exams/[id]/credentials/xlsx/route.ts",
  "app/admin/modules/[id]/questions/export/xlsx/route.ts",
  "app/admin/modules/[id]/questions/import/template/route.ts",
  "app/admin/participants/import/template/route.ts",
];

let changed = 0;
let removed = 0;

for (const rel of files) {
  const full = path.resolve(process.cwd(), rel);

  if (!fs.existsSync(full)) {
    console.error(`[EXCELJS-FIX] File tidak ditemukan: ${rel}`);
    process.exit(1);
  }

  const before = fs.readFileSync(full, "utf8");
  const matches = before.match(/^[ \t]*workbook\.title\s*=\s*.*?;\s*\r?\n/gm) || [];
  const after = before.replace(/^[ \t]*workbook\.title\s*=\s*.*?;\s*\r?\n/gm, "");

  removed += matches.length;

  if (after !== before) {
    fs.writeFileSync(full, after, "utf8");
    changed += 1;
    console.log(`[EXCELJS-FIX] Updated: ${rel}`);
  } else {
    console.log(`[EXCELJS-FIX] No title line: ${rel}`);
  }
}

if (removed !== 4) {
  console.error(`[EXCELJS-FIX] FAIL — expected 4 workbook.title lines, removed ${removed}.`);
  console.error("Tidak ada perubahan tambahan. Kirim output ini sebelum lanjut.");
  process.exit(1);
}

console.log(`[EXCELJS-FIX] PASS — removed ${removed} unsupported workbook.title assignments from ${changed} files.`);
