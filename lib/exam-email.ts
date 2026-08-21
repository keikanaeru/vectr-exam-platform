import "server-only";

const EXAM_EMAIL_VARIABLES = [
  "nama_peserta",
  "kode_peserta",
  "nama_ujian",
  "nama_organisasi",
  "tanggal_ujian",
  "waktu_login",
  "hard_close",
  "durasi_ujian",
  "link_ujian",
  "kode_akses",
] as const;

type ExamEmailVariable = (typeof EXAM_EMAIL_VARIABLES)[number];
type ExamEmailVariables = Record<ExamEmailVariable, string>;

const allowedVariables = new Set<string>(EXAM_EMAIL_VARIABLES);
const variablePattern = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

function getUnknownExamEmailVariables(...templates: string[]) {
  const unknown = new Set<string>();

  for (const template of templates) {
    for (const match of template.matchAll(variablePattern)) {
      const key = String(match[1] ?? "").trim();
      if (key && !allowedVariables.has(key)) unknown.add(key);
    }
  }

  return [...unknown].sort();
}

export function validateExamEmailTemplates(subject: string, body: string) {
  if (subject.length > 200) {
    throw new Error("Subject email maksimal 200 karakter.");
  }
  if (/{{\s*kode_akses\s*}}/.test(subject)) {
    throw new Error("{{kode_akses}} tidak boleh ditempatkan di Subject karena subject dapat tampil di notifikasi layar kunci. Letakkan kode akses di isi email.");
  }
  if (body.length > 20_000) {
    throw new Error("Isi email maksimal 20.000 karakter.");
  }

  const unknown = getUnknownExamEmailVariables(subject, body);
  if (unknown.length) {
    throw new Error(
      `Variabel template tidak dikenal: ${unknown.map((key) => `{{${key}}}`).join(", ")}. Gunakan hanya variabel yang tersedia di panel kanan.`
    );
  }
}

export function templateUsesAccessCode(...templates: string[]) {
  return templates.some((template) => /{{\s*kode_akses\s*}}/.test(template));
}

export function renderExamEmailTemplate(
  template: string,
  variables: Partial<ExamEmailVariables>
) {
  return template.replace(variablePattern, (fullMatch, rawKey: string) => {
    const key = String(rawKey).trim() as ExamEmailVariable;
    const value = variables[key];
    return typeof value === "string" ? value : fullMatch;
  });
}

function htmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bodyToHtml(value: string) {
  return htmlEscape(value).replaceAll("\n", "<br>");
}

export function buildParticipantEmailHtml(input: {
  organizationName: string;
  examTitle: string;
  bodyText: string;
  participantLink?: string | null;
}) {
  const organizationName = htmlEscape(input.organizationName);
  const examTitle = htmlEscape(input.examTitle);
  const bodyHtml = bodyToHtml(input.bodyText);
  const participantLink = input.participantLink?.trim();
  const safeLink = participantLink ? htmlEscape(participantLink) : "";

  return `<!doctype html>
<html><body style="margin:0;background:#07101f;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#eaf2ff">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#07101f;padding:36px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;border:1px solid rgba(148,163,184,.20);border-radius:26px;background:#0c1729;overflow:hidden">
<tr><td style="padding:28px 34px 12px"><div style="font-size:22px;font-weight:800;letter-spacing:.14em;color:#fff">VECTR</div><div style="margin-top:5px;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#67e8f9">Exam Platform</div></td></tr>
<tr><td style="padding:12px 34px 8px"><div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#71839d">Penyelenggara</div><div style="margin-top:6px;font-size:17px;font-weight:700;color:#f8fbff">${organizationName}</div><div style="margin-top:5px;font-size:13px;color:#8fa2bd">${examTitle}</div></td></tr>
<tr><td style="padding:22px 34px"><div style="border-top:1px solid rgba(148,163,184,.13);padding-top:22px;font-size:14px;line-height:1.8;color:#c5d2e5">${bodyHtml}</div></td></tr>
${safeLink ? `<tr><td style="padding:0 34px 24px"><a href="${safeLink}" style="display:block;text-align:center;text-decoration:none;padding:14px 20px;border-radius:14px;background:linear-gradient(90deg,#3b82f6,#06b6d4);color:#fff;font-size:14px;font-weight:700">Buka Halaman Ujian</a></td></tr>` : ""}
<tr><td style="padding:18px 34px 30px;border-top:1px solid rgba(148,163,184,.10);color:#657891;font-size:11px;line-height:1.65">Email ini dikirim oleh ${organizationName} melalui VECTR Exam Platform. Jangan membagikan kode akses pribadi kepada orang lain.</td></tr>
</table>
<p style="margin:18px 0 0;color:#43536b;font-size:11px">VECTR Exam Platform · Secure assessment workspace</p>
</td></tr></table></body></html>`;
}
