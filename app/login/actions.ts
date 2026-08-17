"use server";

import { buildAuthConfirmUrl, getPublicAppOrigin, sendAdminSetupEmail } from "@/lib/platform-email";
import { createAdminClient } from "@/lib/supabase/admin";

const GENERIC_MESSAGE = "Jika email terdaftar, link recovery akan dikirim. Cek inbox dan folder spam.";

export async function requestAdminPasswordReset(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { ok: false, message: "Format email tidak valid." } as const;
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: normalized,
    });

    // Keep the public response generic to avoid disclosing whether an account exists.
    if (error || !data?.user || !data.properties?.hashed_token) {
      if (error) console.warn("ADMIN PASSWORD RECOVERY GENERATE WARNING", error.message);
      return { ok: true, message: GENERIC_MESSAGE } as const;
    }

    const userId = data.user.id;
    const [{ data: profile }, { data: membership }] = await Promise.all([
      admin.from("admin_profiles").select("full_name").eq("id", userId).maybeSingle(),
      admin.from("organization_members").select("organization_id").eq("user_id", userId).eq("active", true).limit(1).maybeSingle(),
    ]);

    let organizationName = "VECTR Exam Platform";
    if (membership?.organization_id) {
      const { data: organization } = await admin
        .from("organizations")
        .select("name")
        .eq("id", membership.organization_id)
        .maybeSingle();
      if (organization?.name) organizationName = String(organization.name);
    }

    const origin = await getPublicAppOrigin();
    const actionUrl = buildAuthConfirmUrl(
      origin,
      data.properties.hashed_token,
      "recovery",
      "/update-password?mode=recovery"
    );

    await sendAdminSetupEmail({
      email: normalized,
      fullName: profile?.full_name ? String(profile.full_name) : "Admin",
      organizationName,
      actionUrl,
      mode: "recovery",
      idempotencyKey: `self-recovery/${userId}/${data.properties.hashed_token.slice(0, 18)}`,
    });
  } catch (error) {
    console.warn("ADMIN PASSWORD RECOVERY DELIVERY WARNING", error instanceof Error ? error.message : error);
  }

  return { ok: true, message: GENERIC_MESSAGE } as const;
}
