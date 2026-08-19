import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

const DEVICE_COOKIE = "candidate_device";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getCandidateDeviceId() {
  const value = String((await cookies()).get(DEVICE_COOKIE)?.value ?? "").trim();
  return UUID_V4.test(value) ? value : null;
}

export async function getOrCreateCandidateDeviceId() {
  const cookieStore = await cookies();
  const stored = String(cookieStore.get(DEVICE_COOKIE)?.value ?? "").trim();
  const deviceId = UUID_V4.test(stored) ? stored : randomUUID();

  if (deviceId !== stored) {
    cookieStore.set(DEVICE_COOKIE, deviceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return deviceId;
}
