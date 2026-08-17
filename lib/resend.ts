import "server-only";

import { Resend } from "resend";

let resendClient: Resend | null = null;

export function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY belum tersedia. Fitur email belum dapat digunakan, tetapi fitur ujian lainnya tetap bisa berjalan."
    );
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }

  return resendClient;
}

export function getResendFromEmail() {
  const configured = process.env.RESEND_FROM_EMAIL?.trim();
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "RESEND_FROM_EMAIL wajib diisi untuk production. Gunakan sender domain VECTR yang sudah terverifikasi."
    );
  }

  return "VECTR <onboarding@resend.dev>";
}


export function getResendReplyToEmail() {
  const configured = process.env.RESEND_REPLY_TO_EMAIL?.trim();
  return configured || undefined;
}

export function isProductionEmailReady() {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() &&
      process.env.RESEND_FROM_EMAIL?.trim()
  );
}
