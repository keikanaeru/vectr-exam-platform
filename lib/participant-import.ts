import ExcelJS from "exceljs";
import JSZip from "jszip";

export type ParsedParticipant = {
  candidateCode: string;
  displayName: string;
  externalIdentifier: string | null;
  email: string | null;
  sourceRow: number;
};

type ColumnKey =
  | "candidateCode"
  | "displayName"
  | "externalIdentifier"
  | "email";

type DetectedHeader = {
  rowIndex: number;
  columns: Partial<Record<ColumnKey, number>>;
};

const HEADER_ALIASES: Record<ColumnKey, string[]> = {
  candidateCode: [
    "kode peserta",
    "candidate code",
    "candidate_code",
    "id peserta",
    "id_peserta",
    "nomor peserta",
    "no peserta",
    "kode",
  ],
  displayName: [
    "nama peserta",
    "nama",
    "display name",
    "display_name",
    "name",
  ],
  externalIdentifier: [
    "nik nim",
    "nik / nim",
    "nik",
    "nim",
    "external identifier",
    "external_identifier",
    "identitas",
  ],
  email: [
    "email",
    "email peserta",
    "e mail",
    "alamat email",
  ],
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
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    const objectValue = value as {
      text?: unknown;
      result?: unknown;
      richText?: Array<{ text?: unknown }>;
      hyperlink?: unknown;
    };

    if (typeof objectValue.text === "string") {
      return objectValue.text.trim();
    }

    if (Array.isArray(objectValue.richText)) {
      return objectValue.richText
        .map((part) =>
          typeof part.text === "string" ? part.text : ""
        )
        .join("")
        .trim();
    }

    if (objectValue.result !== undefined) {
      return valueToText(objectValue.result);
    }

    if (typeof objectValue.hyperlink === "string") {
      return objectValue.hyperlink.trim();
    }
  }

  return String(value).trim();
}

function detectHeader(rows: string[][]): DetectedHeader | null {
  const maxRows = Math.min(rows.length, 20);

  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    const columns: Partial<Record<ColumnKey, number>> = {};

    rows[rowIndex].forEach((rawHeader, columnIndex) => {
      const header = normalizeHeader(rawHeader);

      if (!header) {
        return;
      }

      (Object.keys(HEADER_ALIASES) as ColumnKey[]).forEach(
        (key) => {
          if (columns[key] !== undefined) {
            return;
          }

          if (
            HEADER_ALIASES[key].some(
              (alias) => normalizeHeader(alias) === header
            )
          ) {
            columns[key] = columnIndex;
          }
        }
      );
    });

    if (
      columns.candidateCode !== undefined &&
      columns.displayName !== undefined
    ) {
      return {
        rowIndex,
        columns,
      };
    }
  }

  return null;
}

function parseRows(rows: string[][]): ParsedParticipant[] {
  const detected = detectHeader(rows);

  if (!detected) {
    throw new Error(
      'Header tidak dikenali. Minimal harus ada kolom "Kode Peserta" dan "Nama Peserta". Gunakan template import agar paling aman.'
    );
  }

  const participants: ParsedParticipant[] = [];

  for (
    let index = detected.rowIndex + 1;
    index < rows.length;
    index += 1
  ) {
    const row = rows[index] ?? [];

    const getValue = (key: ColumnKey) => {
      const columnIndex = detected.columns[key];

      if (columnIndex === undefined) {
        return "";
      }

      return (row[columnIndex] ?? "").trim();
    };

    const candidateCode = getValue("candidateCode");
    const displayName = getValue("displayName");
    const externalIdentifier = getValue("externalIdentifier");
    const email = getValue("email");

    if (
      !candidateCode &&
      !displayName &&
      !externalIdentifier &&
      !email
    ) {
      continue;
    }

    participants.push({
      candidateCode,
      displayName,
      externalIdentifier: externalIdentifier || null,
      email: email || null,
      sourceRow: index + 1,
    });
  }

  if (participants.length === 0) {
    throw new Error(
      "File terbaca, tetapi tidak ada baris peserta yang dapat diimpor."
    );
  }

  return participants;
}

function detectCsvDelimiter(text: string) {
  const preview = text.split(/\r?\n/).slice(0, 5).join("\n");
  const candidates = [",", ";", "\t"];

  return candidates
    .map((delimiter) => ({
      delimiter,
      count: preview.split(delimiter).length - 1,
    }))
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
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === delimiter && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += character;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.map((currentRow) =>
    currentRow.map((value) => value.trim())
  );
}

function workbookToParticipants(workbook: ExcelJS.Workbook) {
  const worksheets = workbook.worksheets ?? [];

  if (worksheets.length === 0) {
    throw new Error("Workbook Excel tidak memiliki worksheet.");
  }

  const prioritized = [
    ...worksheets.filter(
      (worksheet) => normalizeHeader(worksheet.name) === "peserta"
    ),
    ...worksheets.filter(
      (worksheet) => normalizeHeader(worksheet.name) !== "peserta"
    ),
  ];

  for (const worksheet of prioritized) {
    const rows: string[][] = [];

    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const values: string[] = [];
      const maxCell = Math.max(row.cellCount, 4);

      for (let columnIndex = 1; columnIndex <= maxCell; columnIndex += 1) {
        values.push(valueToText(row.getCell(columnIndex).value));
      }

      rows[rowNumber - 1] = values;
    });

    if (detectHeader(rows)) {
      return parseRows(rows);
    }
  }

  throw new Error(
    'Tidak menemukan worksheet dengan header "Kode Peserta" dan "Nama Peserta".'
  );
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function columnIndexFromReference(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  let index = 0;

  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }

  return Math.max(0, index - 1);
}

function xmlTextNodes(xml: string) {
  const values: string[] = [];
  const regex = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml)) !== null) {
    values.push(decodeXml(match[1]));
  }

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

    while ((siMatch = siRegex.exec(xml)) !== null) {
      sharedStrings.push(xmlTextNodes(siMatch[1]));
    }
  }

  const sheetNames = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (const sheetName of sheetNames) {
    const sheetFile = zip.file(sheetName);

    if (!sheetFile) {
      continue;
    }

    const xml = await sheetFile.async("string");
    const rows: string[][] = [];
    const rowRegex = /<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g;
    let rowMatch: RegExpExecArray | null;
    let sequentialRow = 0;

    while ((rowMatch = rowRegex.exec(xml)) !== null) {
      const rowAttributes = rowMatch[1];
      const rowBody = rowMatch[2];
      const explicitRow = Number(rowAttributes.match(/\br="(\d+)"/)?.[1]);
      const rowIndex = Number.isFinite(explicitRow) && explicitRow > 0
        ? explicitRow - 1
        : sequentialRow;
      sequentialRow = rowIndex + 1;

      const values: string[] = [];
      const cellRegex = /<(?:\w+:)?c\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/g;
      let cellMatch: RegExpExecArray | null;

      while ((cellMatch = cellRegex.exec(rowBody)) !== null) {
        const attributes = cellMatch[1];
        const body = cellMatch[2];
        const reference = attributes.match(/\br="([A-Z]+\d+)"/i)?.[1] ?? "A1";
        const type = attributes.match(/\bt="([^"]+)"/)?.[1] ?? "";
        const columnIndex = columnIndexFromReference(reference);
        const rawValue = body.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1] ?? "";
        let value = "";

        if (type === "s") {
          const sharedIndex = Number(rawValue);
          value = Number.isFinite(sharedIndex)
            ? sharedStrings[sharedIndex] ?? ""
            : "";
        } else if (type === "inlineStr") {
          value = xmlTextNodes(body);
        } else if (type === "str") {
          value = decodeXml(rawValue);
        } else {
          value = decodeXml(rawValue);
        }

        values[columnIndex] = value.trim();
      }

      rows[rowIndex] = values;
    }

    if (detectHeader(rows)) {
      return parseRows(rows);
    }
  }

  throw new Error(
    'File Excel terbaca, tetapi tidak ditemukan tabel peserta dengan kolom "Kode Peserta" dan "Nama Peserta".'
  );
}

async function parseXlsx(buffer: Buffer) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    return workbookToParticipants(workbook);
  } catch (excelJsError) {
    console.warn(
      "EXCELJS PARTICIPANT IMPORT FALLBACK:",
      excelJsError instanceof Error ? excelJsError.message : excelJsError
    );

    return parseXlsxXmlFallback(buffer);
  }
}

export async function parseParticipantImportFile(
  file: File
): Promise<ParsedParticipant[]> {
  const fileName = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (fileName.endsWith(".xlsx")) {
    return parseXlsx(buffer);
  }

  if (fileName.endsWith(".csv")) {
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    return parseRows(parseCsv(text));
  }

  throw new Error(
    "Format file belum didukung. Gunakan Microsoft Excel (.xlsx) atau CSV (.csv)."
  );
}
