import "server-only";

import { headers } from "next/headers";

import { getResendClient, getResendFromEmail, getResendReplyToEmail } from "@/lib/resend";

function htmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeOrigin(value: string | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export async function getPublicAppOrigin() {
  // Production email links should use one explicitly configured canonical URL.
  const configured = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;

  const vercelUrl = normalizeOrigin(process.env.VERCEL_URL);
  if (vercelUrl) return vercelUrl;

  // Request headers are only a local/development fallback, never the preferred
  // source for links sent from a deployed application.
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || requestHeaders.get("host")?.trim();
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || (host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https");
  const requestOrigin = normalizeOrigin(host ? `${protocol}://${host}` : undefined);
  if (requestOrigin) return requestOrigin;

  return "http://localhost:3000";
}

export function buildAuthConfirmUrl(origin: string, tokenHash: string, type: "invite" | "magiclink" | "recovery", next = "/update-password") {
  const url = new URL("/activate-account", origin);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  url.searchParams.set("next", next);
  return url.toString();
}

function emailShell(input: { eyebrow: string; title: string; intro: string; organizationName: string; buttonLabel: string; actionUrl: string; footer: string }) {
  const eyebrow = htmlEscape(input.eyebrow);
  const title = htmlEscape(input.title);
  const intro = htmlEscape(input.intro);
  const organizationName = htmlEscape(input.organizationName);
  const buttonLabel = htmlEscape(input.buttonLabel);
  const actionUrl = htmlEscape(input.actionUrl);
  const footer = htmlEscape(input.footer);

  return `<!doctype html>
<html><body style="margin:0;background:#07101f;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#eaf2ff">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#07101f;padding:38px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;border:1px solid rgba(148,163,184,.20);border-radius:28px;background:linear-gradient(145deg,#111c31,#0b1426);box-shadow:0 24px 80px rgba(0,0,0,.35);overflow:hidden">
<tr><td style="padding:32px 38px 8px"><div style="font-size:22px;font-weight:800;letter-spacing:.14em;color:#fff">VECTR</div><div style="margin-top:5px;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#67e8f9">Exam Platform</div></td></tr>
<tr><td style="padding:18px 38px 18px">
<div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#67e8f9">${eyebrow}</div>
<h1 style="margin:14px 0 12px;font-size:30px;line-height:1.18;color:#fff">${title}</h1>
<p style="margin:0;color:#9fb0c9;font-size:15px;line-height:1.75">${intro}</p>
</td></tr>
<tr><td style="padding:8px 38px 4px"><div style="padding:18px 20px;border-radius:18px;border:1px solid rgba(103,232,249,.15);background:rgba(103,232,249,.055)"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:#69809f">Organisasi</div><div style="margin-top:7px;font-size:17px;font-weight:700;color:#f8fbff">${organizationName}</div></div></td></tr>
<tr><td style="padding:26px 38px 12px"><a href="${actionUrl}" style="display:block;text-align:center;text-decoration:none;padding:15px 22px;border-radius:15px;background:linear-gradient(90deg,#3b82f6,#06b6d4);color:white;font-size:15px;font-weight:700">${buttonLabel}</a></td></tr>
<tr><td style="padding:8px 38px 34px"><p style="margin:0;color:#71839d;font-size:12px;line-height:1.7">${footer}</p><p style="margin:14px 0 0;color:#53657f;font-size:11px;line-height:1.65;word-break:break-all">Jika tombol tidak bekerja, buka tautan berikut:<br>${actionUrl}</p></td></tr>
</table>
<p style="margin:18px 0 0;color:#43536b;font-size:11px">VECTR Exam Platform · Secure assessment workspace</p>
</td></tr></table></body></html>`;
}

export async function sendAdminSetupEmail(input: {
  email: string;
  fullName: string;
  organizationName: string;
  actionUrl: string;
  mode: "invite" | "recovery";
  idempotencyKey: string;
}) {
  const resend = getResendClient();
  const from = getResendFromEmail();
  const replyTo = getResendReplyToEmail();
  const firstName = input.fullName.trim().split(/\s+/)[0] || input.fullName;
  const isInvite = input.mode === "invite";
  const subject = isInvite
    ? `Aktifkan akun VECTR Exam Platform · ${input.organizationName}`
    : `Atur ulang password VECTR Exam Platform · ${input.organizationName}`;
  const intro = isInvite
    ? `Halo ${firstName}, akses admin untuk ${input.organizationName} sudah disiapkan. Klik tombol di bawah untuk memverifikasi email dan membuat password Anda sendiri.`
    : `Halo ${firstName}, gunakan tombol di bawah untuk membuat password baru akun VECTR Exam Platform Anda.`;
  const footer = isInvite
    ? "Demi keamanan, jangan teruskan email ini kepada orang lain. Jika tautan sudah kedaluwarsa, minta Platform Owner mengirim ulang undangan."
    : "Jika Anda tidak meminta pengaturan ulang password, abaikan email ini. Tautan dapat kedaluwarsa sesuai kebijakan keamanan Auth.";

  const { data, error } = await resend.emails.send(
    {
      from,
      ...(replyTo ? { replyTo } : {}),
      to: [input.email],
      subject,
      html: emailShell({
        eyebrow: isInvite ? "Undangan Admin" : "Keamanan Akun",
        title: isInvite ? "Akun Anda sudah siap" : "Buat password baru",
        intro,
        organizationName: input.organizationName,
        buttonLabel: isInvite ? "Aktifkan Akun & Buat Password" : "Atur Ulang Password",
        actionUrl: input.actionUrl,
        footer,
      }),
      text: `VECTR Exam Platform\n\n${intro}\n\n${input.organizationName}\n${input.actionUrl}\n\n${footer}`,
    },
    { idempotencyKey: input.idempotencyKey }
  );

  if (error || !data?.id) {
    const message = typeof error === "object" && error && "message" in error ? String(error.message) : "Resend tidak menerima email.";
    throw new Error(message);
  }

  return data.id;
}

export async function sendAccessGrantedEmail(input: {
  email: string;
  fullName: string;
  organizationName: string;
  loginUrl: string;
  idempotencyKey: string;
}) {
  const resend = getResendClient();
  const from = getResendFromEmail();
  const replyTo = getResendReplyToEmail();
  const firstName = input.fullName.trim().split(/\s+/)[0] || input.fullName;
  const intro = `Halo ${firstName}, akun Anda yang sudah aktif kini mendapat akses admin ke ${input.organizationName}. Gunakan akun yang sama untuk login.`;
  const { data, error } = await resend.emails.send(
    {
      from,
      ...(replyTo ? { replyTo } : {}),
      to: [input.email],
      subject: `Akses admin ditambahkan · ${input.organizationName}`,
      html: emailShell({
        eyebrow: "Akses Admin",
        title: "Workspace baru ditambahkan",
        intro,
        organizationName: input.organizationName,
        buttonLabel: "Buka Halaman Login",
        actionUrl: input.loginUrl,
        footer: "Jika Anda tidak mengenali pemberian akses ini, hubungi pengelola VECTR Exam Platform.",
      }),
      text: `VECTR Exam Platform\n\n${intro}\n\n${input.loginUrl}`,
    },
    { idempotencyKey: input.idempotencyKey }
  );
  if (error || !data?.id) {
    const message = typeof error === "object" && error && "message" in error ? String(error.message) : "Resend tidak menerima email.";
    throw new Error(message);
  }
  return data.id;
}
