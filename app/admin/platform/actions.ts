"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin-context";
import { databaseErrorMessage } from "@/lib/db-error";
import { buildAuthConfirmUrl, getPublicAppOrigin, sendAccessGrantedEmail, sendAdminSetupEmail } from "@/lib/platform-email";

function redirectWithError(message: string): never {
  redirect(`/admin/platform?error=${encodeURIComponent(message)}`);
}

function redirectWithSuccess(message: string): never {
  redirect(`/admin/platform?success=${encodeURIComponent(message)}`);
}

function isValidSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isValidCode(value: string) {
  return /^[A-Z0-9][A-Z0-9_-]*$/.test(value);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function requirePlatformOwner() {
  const context = await getAdminContext();
  if (!context) redirect("/login");
  if (!context.profile.isPlatformOwner) redirect("/admin");
  return context;
}


type AdminAuthUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string;
  confirmed_at?: string;
};

type AdminAuthLookupRow = {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
};

async function findAuthUserByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await admin
    .rpc("exam_platform_find_auth_user_by_email", { p_email: normalized })
    .maybeSingle();

  if (error) {
    throw new Error(`Gagal memeriksa akun Auth: ${error.message}. Jalankan migration R8.3.`);
  }
  if (!data) return null;

  const authRow = data as unknown as AdminAuthLookupRow;

  return {
    id: String(authRow.id),
    email: authRow.email ? String(authRow.email) : normalized,
    email_confirmed_at: authRow.email_confirmed_at
      ? String(authRow.email_confirmed_at)
      : undefined,
  } as AdminAuthUser;
}


async function preflightCustomerAdminEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string
) {
  const authUser = await findAuthUserByEmail(admin, email);
  if (!authUser) return null;

  const { data: profile, error } = await admin
    .from("admin_profiles")
    .select("id, is_platform_owner, active")
    .eq("id", authUser.id)
    .maybeSingle();
  if (error) throw new Error(`Profil admin gagal diperiksa sebelum onboarding: ${error.message}`);
  if (profile?.is_platform_owner) {
    redirectWithError("Email admin utama adalah akun Platform Owner. Gunakan email PIC pelanggan yang berbeda.");
  }
  if (profile && !profile.active) {
    redirectWithError("Email admin utama sudah terdaftar tetapi akunnya sedang nonaktif. Aktifkan akun tersebut terlebih dahulu.");
  }
  return authUser;
}

async function writeAdminInviteEvent(
  admin: ReturnType<typeof createAdminClient>,
  input: { organizationId: string; actorUserId: string; eventType: string; note: string }
) {
  const { error } = await admin.from("organization_subscription_events").insert({
    organization_id: input.organizationId,
    event_type: input.eventType,
    actor_user_id: input.actorUserId,
    note: input.note,
  });
  if (error) console.warn("ADMIN INVITE EVENT WARNING", error.message);
}

async function ensureAdminProfileAndMembership(
  admin: ReturnType<typeof createAdminClient>,
  input: { userId: string; fullName: string; organizationId: string }
) {
  const { data: existingProfile, error: profileReadError } = await admin
    .from("admin_profiles")
    .select("id, is_platform_owner, active")
    .eq("id", input.userId)
    .maybeSingle();
  if (profileReadError) throw new Error(`Profil admin gagal diperiksa: ${profileReadError.message}`);

  if (existingProfile?.is_platform_owner) {
    throw new Error("Email tersebut adalah akun Platform Owner dan tidak dapat dipakai sebagai admin pelanggan.");
  }
  if (existingProfile && !existingProfile.active) {
    throw new Error("Akun admin dengan email tersebut sedang nonaktif. Aktifkan akun lama terlebih dahulu.");
  }

  if (!existingProfile) {
    const { error } = await admin.from("admin_profiles").insert({
      id: input.userId,
      full_name: input.fullName,
      role: "ADMIN",
      active: true,
      is_platform_owner: false,
    });
    if (error) throw new Error(`Profil admin gagal dibuat: ${error.message}`);
  } else {
    const { error } = await admin
      .from("admin_profiles")
      .update({ full_name: input.fullName })
      .eq("id", input.userId);
    if (error) throw new Error(`Profil admin gagal diperbarui: ${error.message}`);
  }

  const { data: membership, error: membershipReadError } = await admin
    .from("organization_members")
    .select("id, active")
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (membershipReadError) throw new Error(`Akses organisasi gagal diperiksa: ${membershipReadError.message}`);

  if (!membership) {
    const { error } = await admin.from("organization_members").insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      role: "ADMIN",
      active: true,
    });
    if (error) throw new Error(`Akses organisasi admin gagal dibuat: ${error.message}`);
  } else if (!membership.active) {
    const { error } = await admin.from("organization_members").update({ active: true }).eq("id", membership.id);
    if (error) throw new Error(`Akses organisasi admin gagal diaktifkan: ${error.message}`);
  }
}

async function generateAndSendAdminAccess(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    organizationId: string;
    organizationName: string;
    fullName: string;
    email: string;
    actorUserId: string;
    forceSetupLink?: boolean;
    knownAuthUser?: AdminAuthUser | null;
  }
) {
  const origin = await getPublicAppOrigin();
  let authUser = input.knownAuthUser === undefined
    ? await findAuthUserByEmail(admin, input.email)
    : input.knownAuthUser;
  let newAuthUser = false;
  let setupMode: "invite" | "magiclink" | "recovery" | "existing";
  let emailMode: "invite" | "recovery" = "invite";
  let tokenHash = "";

  if (!authUser) {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email: input.email,
      options: {
        data: { full_name: input.fullName },
      },
    });
    if (error || !data?.user || !data.properties?.hashed_token) {
      throw new Error(error?.message || "Supabase gagal membuat link undangan.");
    }
    authUser = data.user as AdminAuthUser;
    tokenHash = data.properties.hashed_token;
    newAuthUser = true;
    setupMode = "invite";
    emailMode = "invite";
  } else {
    const confirmed = Boolean(authUser.email_confirmed_at || authUser.confirmed_at);
    if (confirmed && !input.forceSetupLink) {
      setupMode = "existing";
    } else {
      if (confirmed) {
        const { data, error } = await admin.auth.admin.generateLink({
          type: "recovery",
          email: input.email,
        });
        if (error || !data?.properties?.hashed_token) {
          throw new Error(error?.message || "Supabase gagal membuat link reset password.");
        }
        tokenHash = data.properties.hashed_token;
        setupMode = "recovery";
        emailMode = "recovery";
      } else {
        const { data, error } = await admin.auth.admin.generateLink({
          type: "magiclink",
          email: input.email,
          options: { data: { full_name: input.fullName } },
        });
        if (error || !data?.properties?.hashed_token) {
          throw new Error(error?.message || "Supabase gagal membuat link aktivasi ulang.");
        }
        tokenHash = data.properties.hashed_token;
        setupMode = "magiclink";
        emailMode = "invite";
      }
    }
  }

  if (!authUser) throw new Error("Akun Auth admin gagal disiapkan.");

  try {
    await ensureAdminProfileAndMembership(admin, {
      userId: authUser.id,
      fullName: input.fullName,
      organizationId: input.organizationId,
    });
  } catch (error) {
    if (newAuthUser) {
      try { await admin.auth.admin.deleteUser(authUser.id); } catch { /* best-effort rollback */ }
    }
    throw error;
  }

  if (setupMode === "existing") {
    const loginUrl = `${origin}/login`;
    const providerMessageId = await sendAccessGrantedEmail({
      email: input.email,
      fullName: input.fullName,
      organizationName: input.organizationName,
      loginUrl,
      idempotencyKey: `admin-access/${input.organizationId}/${authUser.id}/${Date.now()}`,
    });
    await writeAdminInviteEvent(admin, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      eventType: "ADMIN_ACCESS_NOTICE_SENT",
      note: `${input.email} mendapat akses organisasi; akun sebelumnya sudah aktif.`,
    });
    return { userId: authUser.id, mode: setupMode, providerMessageId } as const;
  }

  const next = emailMode === "invite" ? "/update-password?mode=invite" : "/update-password?mode=recovery";
  const actionUrl = buildAuthConfirmUrl(origin, tokenHash, setupMode, next);
  const providerMessageId = await sendAdminSetupEmail({
    email: input.email,
    fullName: input.fullName,
    organizationName: input.organizationName,
    actionUrl,
    mode: emailMode,
    idempotencyKey: `admin-setup/${input.organizationId}/${authUser.id}/${tokenHash.slice(0, 18)}`,
  });
  await writeAdminInviteEvent(admin, {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    eventType: setupMode === "invite" ? "ADMIN_INVITE_SENT" : "ADMIN_SETUP_LINK_SENT",
    note: `Link aktivasi dikirim ke ${input.email}.`,
  });
  return { userId: authUser.id, mode: setupMode, providerMessageId } as const;
}

function refreshPlatform() {
  // Platform mutations tidak perlu menginvalidasi seluruh modul/peserta/ujian.
  // Halaman lain bersifat dynamic dan akan membaca data terbaru ketika dibuka.
  revalidatePath("/admin/platform");
  revalidatePath("/admin");
}

async function validateOrganizationInput(
  admin: ReturnType<typeof createAdminClient>,
  input: { name: string; code: string; slug: string },
  excludeId?: string
) {
  const { name, code, slug } = input;

  if (name.length < 2 || name.length > 150) {
    redirectWithError("Nama organisasi wajib 2–150 karakter.");
  }
  if (code.length < 2 || code.length > 50 || !isValidCode(code)) {
    redirectWithError("Kode organisasi wajib 2–50 karakter dan hanya boleh berisi huruf kapital, angka, - atau _.");
  }
  if (slug.length < 2 || slug.length > 100 || !isValidSlug(slug)) {
    redirectWithError("Slug wajib 2–100 karakter dan hanya boleh berisi huruf kecil, angka, dan tanda minus.");
  }

  let codeQuery = admin.from("organizations").select("id").eq("code", code);
  let slugQuery = admin.from("organizations").select("id").eq("slug", slug);
  if (excludeId) {
    codeQuery = codeQuery.neq("id", excludeId);
    slugQuery = slugQuery.neq("id", excludeId);
  }

  const [codeResult, slugResult] = await Promise.all([
    codeQuery.maybeSingle(),
    slugQuery.maybeSingle(),
  ]);

  if (codeResult.error || slugResult.error) {
    console.error("ORGANIZATION UNIQUE CHECK ERROR", codeResult.error, slugResult.error);
    throw new Error("Gagal memvalidasi kode/slug organisasi.");
  }
  if (codeResult.data) redirectWithError(`Kode ${code} sudah digunakan organisasi lain.`);
  if (slugResult.data) redirectWithError(`Slug ${slug} sudah digunakan organisasi lain.`);
}


export async function createCustomerWithAdmin(formData: FormData) {
  const context = await requirePlatformOwner();
  const admin = createAdminClient();

  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("admin_full_name") ?? "").trim();
  const email = String(formData.get("admin_email") ?? "").trim().toLowerCase();

  await validateOrganizationInput(admin, { name, code, slug });
  if (fullName.length < 2 || fullName.length > 150) redirectWithError("Nama admin utama wajib 2–150 karakter.");
  if (!isValidEmail(email)) redirectWithError("Email admin utama tidak valid.");
  const preflightAuthUser = await preflightCustomerAdminEmail(admin, email);

  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .insert({ name, code, slug, active: true })
    .select("id, name")
    .single();
  if (organizationError || !organization) {
    redirectWithError(databaseErrorMessage("CUSTOMER_CREATE", "Organisasi pelanggan gagal dibuat.", organizationError));
  }

  let delivery: Awaited<ReturnType<typeof generateAndSendAdminAccess>>;
  try {
    delivery = await generateAndSendAdminAccess(admin, {
      organizationId: organization.id,
      organizationName: organization.name,
      fullName,
      email,
      actorUserId: context.userId,
      knownAuthUser: preflightAuthUser,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Undangan admin gagal diproses.";
    // Organisasi dipertahankan bila provisioning sudah sempat membuat akun/membership,
    // sehingga Platform Owner bisa mengirim ulang tanpa kehilangan subscription baru.
    refreshPlatform();
    redirectWithError(`${organization.name} sudah dibuat, tetapi email/admin onboarding belum tuntas: ${message}`);
  }
  refreshPlatform();
  redirectWithSuccess(
    delivery.mode === "existing"
      ? `${organization.name} dibuat. Akses ${fullName} diperbarui dan email diterima Resend untuk dikirim ke ${email}.`
      : `${organization.name} dibuat. Undangan diterima Resend untuk dikirim ke ${email}.`
  );
}


export async function renewOrganizationSubscription(organizationId: string) {
  const context = await requirePlatformOwner();
  const admin = createAdminClient();

  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .select("id, name")
    .eq("id", organizationId)
    .maybeSingle();
  if (organizationError || !organization) redirectWithError("Organisasi pelanggan tidak ditemukan.");

  const { error } = await admin.rpc("exam_platform_renew_subscription_30d", {
    p_organization_id: organizationId,
    p_actor_user_id: context.userId,
  });
  if (error) {
    redirectWithError(databaseErrorMessage("SUBSCRIPTION_RENEW", "Langganan gagal diperpanjang.", error));
  }

  refreshPlatform();
  redirectWithSuccess(`Langganan ${organization.name} diperpanjang 30 hari.`);
}

export async function toggleOrganizationSubscriptionSuspension(
  organizationId: string,
  formData: FormData
) {
  const context = await requirePlatformOwner();
  const admin = createAdminClient();

  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .select("id, name")
    .eq("id", organizationId)
    .maybeSingle();
  if (organizationError || !organization) redirectWithError("Organisasi pelanggan tidak ditemukan.");

  const { data: subscription, error: subscriptionError } = await admin
    .from("organization_subscriptions")
    .select("organization_id, suspended_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (subscriptionError || !subscription) {
    redirectWithError("Subscription organisasi belum tersedia. Jalankan R7_SUBSCRIPTION_UPGRADE.sql.");
  }

  const isSuspended = Boolean(subscription.suspended_at);

  if (!isSuspended) {
    const { data: activeExam, error: activeExamError } = await admin
      .from("exams")
      .select("id, title")
      .eq("organization_id", organizationId)
      .eq("status", "ACTIVE")
      .limit(1)
      .maybeSingle();

    if (activeExamError) {
      redirectWithError(databaseErrorMessage("SUBSCRIPTION_ACTIVE_EXAM_CHECK", "Gagal memeriksa ujian aktif sebelum suspend.", activeExamError));
    }
    if (activeExam) {
      redirectWithError(
        `Langganan belum boleh ditangguhkan karena ujian “${String(activeExam.title ?? "Ujian aktif")}” masih ACTIVE. Tutup ujian terlebih dahulu agar peserta yang sedang mengerjakan tidak terputus.`
      );
    }
  }

  const reasonInput = String(formData.get("reason") ?? "").trim();
  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("organization_subscriptions")
    .update({
      suspended_at: isSuspended ? null : now,
      suspension_reason: isSuspended ? null : (reasonInput || "Ditangguhkan oleh Platform Owner"),
      updated_at: now,
    })
    .eq("organization_id", organizationId);

  if (updateError) {
    redirectWithError(databaseErrorMessage("SUBSCRIPTION_SUSPEND", "Status langganan gagal diubah.", updateError));
  }

  const { error: eventError } = await admin.from("organization_subscription_events").insert({
    organization_id: organizationId,
    event_type: isSuspended ? "RESUMED" : "SUSPENDED",
    actor_user_id: context.userId,
    note: isSuspended ? "Langganan diaktifkan kembali" : (reasonInput || "Ditangguhkan oleh Platform Owner"),
  });
  if (eventError) console.warn("SUBSCRIPTION EVENT WARNING", eventError.message);

  refreshPlatform();
  redirectWithSuccess(
    isSuspended
      ? `Langganan ${organization.name} diaktifkan kembali.`
      : `Langganan ${organization.name} ditangguhkan.`
  );
}

export async function updateOrganization(organizationId: string, formData: FormData) {
  await requirePlatformOwner();
  const admin = createAdminClient();

  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();

  await validateOrganizationInput(admin, { name, code, slug }, organizationId);

  const { data, error } = await admin
    .from("organizations")
    .update({ name, code, slug })
    .eq("id", organizationId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirectWithError(databaseErrorMessage("ORGANIZATION_UPDATE", "Organisasi gagal diperbarui.", error));
  }

  refreshPlatform();
  redirectWithSuccess(`${name} berhasil diperbarui.`);
}

export async function toggleOrganizationStatus(organizationId: string) {
  await requirePlatformOwner();
  const admin = createAdminClient();

  const { data: organization, error: readError } = await admin
    .from("organizations")
    .select("id, name, active")
    .eq("id", organizationId)
    .maybeSingle();

  if (readError || !organization) redirectWithError("Organisasi tidak ditemukan.");

  const nextActive = !Boolean(organization.active);
  const { error } = await admin
    .from("organizations")
    .update({ active: nextActive })
    .eq("id", organizationId);

  if (error) {
    redirectWithError(databaseErrorMessage("ORGANIZATION_STATUS_UPDATE", "Status organisasi gagal diubah.", error));
  }

  refreshPlatform();
  redirectWithSuccess(`${organization.name} sekarang ${nextActive ? "aktif" : "nonaktif"}.`);
}

export async function deleteOrganization(organizationId: string) {
  await requirePlatformOwner();
  const admin = createAdminClient();

  const { data: organization } = await admin
    .from("organizations")
    .select("id, name")
    .eq("id", organizationId)
    .maybeSingle();
  if (!organization) redirectWithError("Organisasi tidak ditemukan.");

  const dependencies = [
    { table: "modules", label: "modul" },
    { table: "batches", label: "batch" },
    { table: "candidates", label: "peserta" },
    { table: "exams", label: "ujian" },
  ] as const;

  const dependencyResults = await Promise.all(
    dependencies.map(async ({ table, label }) => {
      const { count, error } = await admin
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId);
      if (error) throw new Error(`Gagal memeriksa ${label}: ${error.message}`);
      return { label, count: count ?? 0 };
    })
  );

  const blockers = dependencyResults.filter((item) => item.count > 0);
  if (blockers.length) {
    redirectWithError(
      `Organisasi tidak dihapus karena masih menyimpan ${blockers.map((item) => `${item.count} ${item.label}`).join(", ")}. Gunakan Nonaktifkan agar histori tetap aman.`
    );
  }

  // Simpan daftar admin sebelum membership dilepas. Setelah organisasi terhapus,
  // akun admin yang benar-benar tidak punya workspace lain ikut dibersihkan agar
  // tidak meninggalkan akun orphan di daftar Platform Owner.
  const { data: membershipsBeforeDelete, error: membershipReadError } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId);
  if (membershipReadError) {
    redirectWithError(databaseErrorMessage("ORGANIZATION_MEMBERSHIP_READ", "Akses admin organisasi gagal diperiksa.", membershipReadError));
  }
  const formerAdminIds = [...new Set((membershipsBeforeDelete ?? []).map((row) => String(row.user_id)))];

  const { error: membershipDeleteError } = await admin
    .from("organization_members")
    .delete()
    .eq("organization_id", organizationId);
  if (membershipDeleteError) {
    redirectWithError(
      databaseErrorMessage(
        "ORGANIZATION_MEMBERSHIP_DELETE",
        "Akses admin organisasi gagal dihapus.",
        membershipDeleteError
      )
    );
  }

  const { error } = await admin.from("organizations").delete().eq("id", organizationId);
  if (error) {
    redirectWithError(databaseErrorMessage("ORGANIZATION_DELETE", "Organisasi gagal dihapus.", error));
  }

  let orphanAdminsRemoved = 0;
  let orphanCleanupWarnings = 0;

  for (const userId of formerAdminIds) {
    const [{ count: remainingMemberships, error: remainingError }, { data: profile, error: profileError }] = await Promise.all([
      admin.from("organization_members").select("id", { count: "exact", head: true }).eq("user_id", userId),
      admin.from("admin_profiles").select("id, is_platform_owner").eq("id", userId).maybeSingle(),
    ]);

    if (remainingError || profileError) {
      orphanCleanupWarnings += 1;
      console.warn("ORPHAN ADMIN CHECK WARNING", userId, remainingError?.message, profileError?.message);
      continue;
    }
    if (!profile || profile.is_platform_owner || (remainingMemberships ?? 0) > 0) continue;

    const { error: profileDeleteError } = await admin.from("admin_profiles").delete().eq("id", userId);
    if (profileDeleteError) {
      orphanCleanupWarnings += 1;
      console.warn("ORPHAN ADMIN PROFILE DELETE WARNING", userId, profileDeleteError.message);
      continue;
    }

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      orphanCleanupWarnings += 1;
      console.warn("ORPHAN ADMIN AUTH DELETE WARNING", userId, authDeleteError.message);
      continue;
    }
    orphanAdminsRemoved += 1;
  }

  refreshPlatform();
  redirectWithSuccess(
    `${organization.name} berhasil dihapus.${orphanAdminsRemoved ? ` ${orphanAdminsRemoved} akun admin tanpa workspace ikut dibersihkan.` : ""}${orphanCleanupWarnings ? ` ${orphanCleanupWarnings} akun perlu dicek manual di Supabase Auth.` : ""}`
  );
}

export async function createOrganizationAdmin(formData: FormData) {
  const context = await requirePlatformOwner();
  const admin = createAdminClient();

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const organizationId = String(formData.get("organization_id") ?? "").trim();

  if (fullName.length < 2 || fullName.length > 150) redirectWithError("Nama admin wajib 2–150 karakter.");
  if (!isValidEmail(email)) redirectWithError("Email admin tidak valid.");
  if (!organizationId) redirectWithError("Pilih organisasi untuk admin.");

  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .select("id, name, active")
    .eq("id", organizationId)
    .maybeSingle();
  if (organizationError || !organization || !organization.active) redirectWithError("Organisasi admin tidak valid atau sedang nonaktif.");

  let delivery: Awaited<ReturnType<typeof generateAndSendAdminAccess>>;
  try {
    delivery = await generateAndSendAdminAccess(admin, {
      organizationId,
      organizationName: organization.name,
      fullName,
      email,
      actorUserId: context.userId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Undangan admin gagal dikirim.";
    refreshPlatform();
    redirectWithError(`Onboarding admin belum tuntas: ${message}`);
  }
  refreshPlatform();
  redirectWithSuccess(
    delivery.mode === "existing"
      ? `${fullName} mendapat akses ke ${organization.name}. Email diterima Resend untuk dikirim ke ${email}.`
      : `Undangan admin ${organization.name} diterima Resend untuk dikirim ke ${email}.`
  );
}

export async function resendOrganizationAdminInvite(adminId: string, organizationId: string) {
  const context = await requirePlatformOwner();
  const admin = createAdminClient();

  const [{ data: profile, error: profileError }, { data: organization, error: organizationError }, { data: membership, error: membershipError }] = await Promise.all([
    admin.from("admin_profiles").select("id, full_name, is_platform_owner").eq("id", adminId).maybeSingle(),
    admin.from("organizations").select("id, name, active").eq("id", organizationId).maybeSingle(),
    admin.from("organization_members").select("id, active").eq("user_id", adminId).eq("organization_id", organizationId).maybeSingle(),
  ]);
  if (profileError || !profile || profile.is_platform_owner) redirectWithError("Admin tidak valid untuk dikirimi ulang undangan.");
  if (organizationError || !organization || !organization.active) redirectWithError("Organisasi tidak valid atau sedang nonaktif.");
  if (membershipError || !membership) redirectWithError("Akses organisasi admin tidak ditemukan.");

  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(adminId);
  if (authError || !authUser.user?.email) redirectWithError("Email Auth admin tidak ditemukan.");

  try {
    await generateAndSendAdminAccess(admin, {
      organizationId,
      organizationName: organization.name,
      fullName: profile.full_name,
      email: authUser.user.email,
      actorUserId: context.userId,
      forceSetupLink: true,
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? `Undangan gagal dikirim ulang: ${error.message}` : "Undangan gagal dikirim ulang.");
  }

  refreshPlatform();
  redirectWithSuccess(`Link aktivasi baru diterima Resend untuk dikirim ke ${authUser.user.email}.`);
}

export async function sendAdminPasswordReset(adminId: string, organizationId: string) {
  const context = await requirePlatformOwner();
  const admin = createAdminClient();
  const [{ data: profile, error: profileError }, { data: organization, error: organizationError }, { data: membership, error: membershipError }, { data: authUser, error: authError }] = await Promise.all([
    admin.from("admin_profiles").select("id, full_name, is_platform_owner").eq("id", adminId).maybeSingle(),
    admin.from("organizations").select("id, name, active").eq("id", organizationId).maybeSingle(),
    admin.from("organization_members").select("id").eq("user_id", adminId).eq("organization_id", organizationId).maybeSingle(),
    admin.auth.admin.getUserById(adminId),
  ]);
  if (profileError || !profile || profile.is_platform_owner) redirectWithError("Admin tidak valid untuk reset password.");
  if (organizationError || !organization) redirectWithError("Organisasi admin tidak ditemukan.");
  if (membershipError || !membership) redirectWithError("Akses organisasi admin tidak ditemukan.");
  if (authError || !authUser.user?.email) redirectWithError("Email Auth admin tidak ditemukan.");

  try {
    await generateAndSendAdminAccess(admin, {
      organizationId,
      organizationName: organization.name,
      fullName: profile.full_name,
      email: authUser.user.email,
      actorUserId: context.userId,
      forceSetupLink: true,
    });
  } catch (error) {
    redirectWithError(error instanceof Error ? `Link password gagal dikirim: ${error.message}` : "Link password gagal dikirim.");
  }

  refreshPlatform();
  redirectWithSuccess(`Link pengaturan password diterima Resend untuk dikirim ke ${authUser.user.email}.`);
}

export async function updateAdmin(adminId: string, formData: FormData) {
  await requirePlatformOwner();
  const admin = createAdminClient();

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const organizationIds = Array.from(new Set(formData.getAll("organization_ids").map(String).filter(Boolean)));

  if (fullName.length < 2 || fullName.length > 150) redirectWithError("Nama admin wajib 2–150 karakter.");
  if (!isValidEmail(email)) redirectWithError("Email admin tidak valid.");

  const { data: profile, error: profileError } = await admin
    .from("admin_profiles")
    .select("id, is_platform_owner")
    .eq("id", adminId)
    .maybeSingle();
  if (profileError || !profile) redirectWithError("Admin tidak ditemukan.");
  if (!profile.is_platform_owner && organizationIds.length === 0) {
    redirectWithError("Admin aktif minimal harus memiliki satu akses organisasi. Gunakan Nonaktifkan Admin jika akses ingin dihentikan sementara.");
  }

  const { data: validOrganizations, error: orgError } = organizationIds.length
    ? await admin.from("organizations").select("id").in("id", organizationIds).eq("active", true)
    : { data: [], error: null };
  if (orgError) throw new Error("Gagal memvalidasi akses organisasi admin.");
  if ((validOrganizations ?? []).length !== organizationIds.length) redirectWithError("Ada organisasi yang tidak valid/nonaktif pada akses admin.");

  const authUpdate: { email?: string; user_metadata?: Record<string, string> } = {
    email,
    user_metadata: { full_name: fullName },
  };

  const { error: authError } = await admin.auth.admin.updateUserById(adminId, authUpdate);
  if (authError) {
    console.error("UPDATE ADMIN AUTH ERROR", authError);
    redirectWithError(`Akun login gagal diperbarui: ${authError.message}`);
  }

  const { error: updateProfileError } = await admin
    .from("admin_profiles")
    .update({ full_name: fullName })
    .eq("id", adminId);
  if (updateProfileError) {
    console.error("UPDATE ADMIN PROFILE ERROR", updateProfileError);
    redirectWithError("Display name admin gagal diperbarui.");
  }

  if (!profile.is_platform_owner) {
    const { data: existingMemberships, error: membershipReadError } = await admin
      .from("organization_members")
      .select("id, organization_id, active")
      .eq("user_id", adminId);
    if (membershipReadError) throw new Error("Gagal membaca akses organisasi admin.");

    for (const membership of existingMemberships ?? []) {
      const shouldBeActive = organizationIds.includes(String(membership.organization_id));
      if (Boolean(membership.active) !== shouldBeActive) {
        const { error: membershipUpdateError } = await admin
          .from("organization_members")
          .update({ active: shouldBeActive })
          .eq("id", membership.id);
        if (membershipUpdateError) {
          redirectWithError(
            databaseErrorMessage(
              "ADMIN_MEMBERSHIP_UPDATE",
              "Akses organisasi admin gagal diperbarui.",
              membershipUpdateError
            )
          );
        }
      }
    }

    const existingOrgIds = new Set((existingMemberships ?? []).map((membership) => String(membership.organization_id)));
    const missing = organizationIds.filter((organizationId) => !existingOrgIds.has(organizationId));
    if (missing.length) {
      const { error: insertError } = await admin.from("organization_members").insert(
        missing.map((organizationId) => ({
          organization_id: organizationId,
          user_id: adminId,
          role: "ADMIN",
          active: true,
        }))
      );
      if (insertError) {
        console.error("ADD ADMIN MEMBERSHIPS ERROR", insertError);
        redirectWithError("Sebagian akses organisasi gagal ditambahkan.");
      }
    }
  }

  refreshPlatform();
  redirectWithSuccess(`${fullName} berhasil diperbarui.`);
}

export async function toggleAdminStatus(adminId: string) {
  const context = await requirePlatformOwner();
  const admin = createAdminClient();

  if (adminId === context.userId) redirectWithError("Akun Platform Owner yang sedang dipakai tidak dapat dinonaktifkan sendiri.");

  const { data: profile, error } = await admin
    .from("admin_profiles")
    .select("id, full_name, active, is_platform_owner")
    .eq("id", adminId)
    .maybeSingle();
  if (error || !profile) redirectWithError("Admin tidak ditemukan.");
  if (profile.is_platform_owner) redirectWithError("Platform Owner tidak dapat dinonaktifkan dari kartu admin biasa.");

  const nextActive = !Boolean(profile.active);
  const { error: updateError } = await admin.from("admin_profiles").update({ active: nextActive }).eq("id", adminId);
  if (updateError) redirectWithError("Status admin gagal diubah.");

  refreshPlatform();
  redirectWithSuccess(`${profile.full_name} sekarang ${nextActive ? "aktif" : "nonaktif"}.`);
}

export async function deleteAdmin(adminId: string) {
  const context = await requirePlatformOwner();
  const admin = createAdminClient();

  if (adminId === context.userId) redirectWithError("Akun yang sedang dipakai tidak dapat dihapus.");

  const { data: profile, error } = await admin
    .from("admin_profiles")
    .select("id, full_name, is_platform_owner")
    .eq("id", adminId)
    .maybeSingle();
  if (error || !profile) redirectWithError("Admin tidak ditemukan.");
  if (profile.is_platform_owner) redirectWithError("Platform Owner tidak dapat dihapus dari sini.");

  const { error: membershipDeleteError } = await admin.from("organization_members").delete().eq("user_id", adminId);
  if (membershipDeleteError) {
    console.error("DELETE ADMIN MEMBERSHIP ERROR", membershipDeleteError);
    redirectWithError("Akses organisasi admin gagal dihapus.");
  }

  const { error: profileDeleteError } = await admin.from("admin_profiles").delete().eq("id", adminId);
  if (profileDeleteError) {
    console.error("DELETE ADMIN PROFILE ERROR", profileDeleteError);
    redirectWithError("Profil admin gagal dihapus.");
  }

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(adminId);
  if (authDeleteError) {
    console.error("DELETE ADMIN AUTH ERROR", authDeleteError);
    redirectWithError("Profil database terhapus tetapi akun Auth gagal dihapus. Periksa Supabase Auth.");
  }

  refreshPlatform();
  redirectWithSuccess(`${profile.full_name} berhasil dihapus dari platform.`);
}
