import ExcelJS from "exceljs";
import JSZip from "jszip";

export type ParsedQuestion = {
  code: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: string;
  weight: number;
  status: "ACTIVE" | "INACTIVE";
  sourceRow: number;
};

type ColumnKey =
  | "code"
  | "questionText"
  | "optionA"
  | "optionB"
  | "optionC"
  | "optionD"
  | "correctOption"
  | "weight"
  | "status";

type DetectedHeader = {
  rowIndex: number;
  columns: Partial<Record<ColumnKey, number>>;
};

const HEADER_ALIASES: Record<ColumnKey, string[]> = {
  code: ["kode soal", "kode", "question code", "question_code", "code"],
  questionText: ["pertanyaan", "soal", "question", "question text", "question_text"],
  optionA: ["opsi a", "option a", "pilihan a", "jawaban a", "a"],
  optionB: ["opsi b", "option b", "pilihan b", "jawaban b", "b"],
  optionC: ["opsi c", "option c", "pilihan c", "jawaban c", "c"],
  optionD: ["opsi d", "option d", "pilihan d", "jawaban d", "d"],
  correctOption: ["kunci", "kunci jawaban", "jawaban benar", "correct option", "correct answer", "answer"],
  weight: ["bobot", "weight", "poin", "point", "score"],
  status: ["status", "aktif", "active"],
};

function normalizeHeader(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_/\\|.,:;()[\]{}-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const objectValue = value as {
      text?: unknown;
      result?: unknown;
      richText?: Array<{ text?: unknown }>;
      hyperlink?: unknown;
    };
    if (typeof objectValue.text === "string") return objectValue.text.trim();
    if (Array.isArray(objectValue.richText)) {
      return objectValue.richText.map((part) => (typeof part.text === "string" ? part.text : "")).join("").trim();
    }
    if (objectValue.result !== undefined) return valueToText(objectValue.result);
    if (typeof objectValue.hyperlink === "string") return objectValue.hyperlink.trim();
  }
  return String(value).trim();
}

function detectHeader(rows: string[][]): DetectedHeader | null {
  const maxRows = Math.min(rows.length, 20);
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    const columns: Partial<Record<ColumnKey, number>> = {};
    (rows[rowIndex] ?? []).forEach((rawHeader, columnIndex) => {
      const header = normalizeHeader(rawHeader);
      if (!header) return;
      (Object.keys(HEADER_ALIASES) as ColumnKey[]).forEach((key) => {
        if (columns[key] !== undefined) return;
        if (HEADER_ALIASES[key].some((alias) => normalizeHeader(alias) === header)) {
          columns[key] = columnIndex;
        }
      });
    });

    if (
      columns.code !== undefined &&
      columns.questionText !== undefined &&
      columns.optionA !== undefined &&
      columns.optionB !== undefined &&
      columns.optionC !== undefined &&
      columns.optionD !== undefined &&
      columns.correctOption !== undefined
    ) {
      return { rowIndex, columns };
    }
  }
  return null;
}

function parseStatus(raw: string): "ACTIVE" | "INACTIVE" {
  const value = raw.trim().toLowerCase();
  if (["inactive", "nonaktif", "non aktif", "0", "false", "tidak"].includes(value)) {
    return "INACTIVE";
  }
  return "ACTIVE";
}

function parseRows(rows: string[][]): ParsedQuestion[] {
  const detected = detectHeader(rows);
  if (!detected) {
    throw new Error('Header soal tidak dikenali. Gunakan template resmi dengan kolom "Kode Soal", "Pertanyaan", "Opsi A-D", dan "Kunci Jawaban".');
  }

  const questions: ParsedQuestion[] = [];

  for (let index = detected.rowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const get = (key: ColumnKey) => {
      const column = detected.columns[key];
      return column === undefined ? "" : (row[column] ?? "").trim();
    };

    const code = get("code");
    const questionText = get("questionText");
    const optionA = get("optionA");
    const optionB = get("optionB");
    const optionC = get("optionC");
    const optionD = get("optionD");
    const correctOption = get("correctOption").toUpperCase();
    const weightRaw = get("weight");
    const statusRaw = get("status");

    if (![code, questionText, optionA, optionB, optionC, optionD, correctOption, weightRaw, statusRaw].some(Boolean)) continue;

    const weight = weightRaw ? Number(weightRaw.replace(",", ".")) : 1;

    questions.push({
      code: code.toUpperCase(),
      questionText,
      optionA,
      optionB,
      optionC,
      optionD,
      correctOption,
      weight,
      status: parseStatus(statusRaw),
      sourceRow: index + 1,
    });
  }

  if (!questions.length) throw new Error("File terbaca, tetapi tidak ada baris soal.");
  return questions;
}

function detectCsvDelimiter(text: string) {
  const preview = text.split(/\r?\n/).slice(0, 5).join("\n");
  return [",", ";", "\t"]
    .map((delimiter) => ({ delimiter, count: preview.split(delimiter).length - 1 }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ",";
}

function parseCsv(text: string) {
  const delimiter = detectCsvDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
      continue;
    }
    if (character === delimiter && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += character;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((current) => current.map((value) => value.trim()));
}

function workbookToQuestions(workbook: ExcelJS.Workbook) {
  const worksheets = workbook.worksheets ?? [];
  const prioritized = [
    ...worksheets.filter((sheet) => ["soal", "bank soal", "questions"].includes(normalizeHeader(sheet.name))),
    ...worksheets.filter((sheet) => !["soal", "bank soal", "questions"].includes(normalizeHeader(sheet.name))),
  ];

  for (const worksheet of prioritized) {
    const rows: string[][] = [];
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const values: string[] = [];
      const maxCell = Math.max(row.cellCount, 9);
      for (let columnIndex = 1; columnIndex <= maxCell; columnIndex += 1) {
        values.push(valueToText(row.getCell(columnIndex).value));
      }
      rows[rowNumber - 1] = values;
    });
    if (detectHeader(rows)) return parseRows(rows);
  }
  throw new Error("Tidak menemukan sheet dengan header bank soal yang dikenali.");
}

function decodeXml(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function columnIndexFromReference(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return Math.max(0, index - 1);
}

function xmlTextNodes(xml: string) {
  const values: string[] = [];
  const regex = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) values.push(decodeXml(match[1]));
  return values.join("");
}

async function parseXlsxXmlFallback(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const sharedStrings: string[] = [];
  const sharedFile = zip.file("xl/sharedStrings.xml");

  if (sharedFile) {
    const xml = await sharedFile.async("string");
    const siRegex = /<(?:\w+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?si>/g;
    let siMatch: RegExpExecArray | null;
    while ((siMatch = siRegex.exec(xml)) !== null) sharedStrings.push(xmlTextNodes(siMatch[1]));
  }

  const sheetNames = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (const sheetName of sheetNames) {
    const sheetFile = zip.file(sheetName);
    if (!sheetFile) continue;
    const xml = await sheetFile.async("string");
    const rows: string[][] = [];
    const rowRegex = /<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g;
    let rowMatch: RegExpExecArray | null;
    let sequentialRow = 0;

    while ((rowMatch = rowRegex.exec(xml)) !== null) {
      const explicitRow = Number(rowMatch[1].match(/\br="(\d+)"/)?.[1]);
      const rowIndex = Number.isFinite(explicitRow) && explicitRow > 0 ? explicitRow - 1 : sequentialRow;
      sequentialRow = rowIndex + 1;
      const values: string[] = [];
      const cellRegex = /<(?:\w+:)?c\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/g;
      let cellMatch: RegExpExecArray | null;

      while ((cellMatch = cellRegex.exec(rowMatch[2])) !== null) {
        const attributes = cellMatch[1];
        const body = cellMatch[2];
        const reference = attributes.match(/\br="([A-Z]+\d+)"/i)?.[1] ?? "A1";
        const type = attributes.match(/\bt="([^"]+)"/)?.[1] ?? "";
        const columnIndex = columnIndexFromReference(reference);
        const rawValue = body.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1] ?? "";
        let value = "";
        if (type === "s") {
          const sharedIndex = Number(rawValue);
          value = Number.isFinite(sharedIndex) ? sharedStrings[sharedIndex] ?? "" : "";
        } else if (type === "inlineStr") value = xmlTextNodes(body);
        else value = decodeXml(rawValue);
        values[columnIndex] = value.trim();
      }
      rows[rowIndex] = values;
    }

    if (detectHeader(rows)) return parseRows(rows);
  }

  throw new Error("File Excel terbaca, tetapi tabel bank soal tidak ditemukan.");
}

async function parseXlsx(buffer: Buffer) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    return workbookToQuestions(workbook);
  } catch (error) {
    console.warn("EXCELJS QUESTION IMPORT FALLBACK:", error instanceof Error ? error.message : error);
    return parseXlsxXmlFallback(buffer);
  }
}

export async function parseQuestionImportFile(file: File): Promise<ParsedQuestion[]> {
  const fileName = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  if (fileName.endsWith(".xlsx")) return parseXlsx(buffer);
  if (fileName.endsWith(".csv")) return parseRows(parseCsv(buffer.toString("utf8").replace(/^\uFEFF/, "")));
  throw new Error("Format file belum didukung. Gunakan .xlsx atau .csv.");
}
