import { redirect } from "next/navigation";

import { getAdminContext } from "@/lib/admin-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { isProductionEmailReady } from "@/lib/resend";
import ConfirmSubmitButton from "@/app/admin/ui/ConfirmSubmitButton";
import AppIcon from "@/app/ui/AppIcon";
import FlashNotice from "@/app/ui/FlashNotice";
import { deriveOrganizationSubscriptionState } from "@/lib/organization-subscription";

import {
  createCustomerWithAdmin,
  createOrganizationAdmin,
  updateOrganization,
  toggleOrganizationStatus,
  deleteOrganization,
  updateAdmin,
  toggleAdminStatus,
  deleteAdmin,
  renewOrganizationSubscription,
  toggleOrganizationSubscriptionSuspension,
  resendOrganizationAdminInvite,
  sendAdminPasswordReset,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { error?: string; success?: string };

type OrganizationRow = {
  id: string;
  code: string;
  name: string;
  slug: string;
  active: boolean;
  created_at: string;
};

type AdminProfileRow = {
  id: string;
  full_name: string;
  role: string;
  active: boolean;
  is_platform_owner: boolean;
  created_at: string;
};

type MembershipRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  active: boolean;
  created_at: string;
};

type SubscriptionRow = {
  organization_id: string;
  plan_code: string | null;
  access_started_at: string | null;
  access_until: string | null;
  retention_until: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
  last_renewed_at: string | null;
};

export default async function PlatformPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const context = await getAdminContext();
  if (!context) redirect("/login");
  if (!context.profile.isPlatformOwner) redirect("/admin");

  const admin = createAdminClient();
  const [organizationsResult, adminsResult, membershipsResult, subscriptionsResult, authUsersResult, healthResult, r6HealthResult, r7HealthResult] = await Promise.all([
    admin.from("organizations").select("id, code, name, slug, active, created_at").order("created_at", { ascending: true }),
    admin.from("admin_profiles").select("id, full_name, role, active, is_platform_owner, created_at").order("created_at", { ascending: true }),
    admin.from("organization_members").select("id, organization_id, user_id, role, active, created_at").order("created_at", { ascending: true }),
    admin.from("organization_subscriptions").select("organization_id, plan_code, access_started_at, access_until, retention_until, suspended_at, suspension_reason, last_renewed_at"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.rpc("exam_platform_healthcheck"),
    admin.rpc("exam_platform_r6_healthcheck"),
    admin.rpc("exam_platform_r7_healthcheck"),
  ]);

  if (organizationsResult.error) throw new Error("Gagal membaca organisasi platform.");
  if (adminsResult.error) throw new Error("Gagal membaca admin platform.");
  if (membershipsResult.error) throw new Error("Gagal membaca akses organisasi.");
  const subscriptionReadError = subscriptionsResult.error
    ? [
        subscriptionsResult.error.code || "NO_CODE",
        subscriptionsResult.error.message || "Subscription table belum bisa dibaca melalui Data API.",
        subscriptionsResult.error.hint || null,
      ].filter(Boolean).join(" · ")
    : null;
  if (authUsersResult.error) console.warn("LIST AUTH USERS WARNING", authUsersResult.error.message);

  const organizations = (organizationsResult.data ?? []) as OrganizationRow[];
  const admins = (adminsResult.data ?? []) as AdminProfileRow[];
  const memberships = (membershipsResult.data ?? []) as MembershipRow[];
  const subscriptions = (subscriptionsResult.error ? [] : (subscriptionsResult.data ?? [])) as SubscriptionRow[];
  const subscriptionMap = new Map(subscriptions.map((item) => [item.organization_id, item]));
  const authUserMap = new Map((authUsersResult.data?.users ?? []).map((user) => [user.id, {
    email: user.email ?? "",
    confirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
    lastSignInAt: user.last_sign_in_at ?? null,
  }]));
  const resendConfigured = Boolean(process.env.RESEND_API_KEY?.trim());
  const resendProductionSender = isProductionEmailReady();

  const activeOrganizations = organizations.filter((item) => item.active);
  const activeAdmins = admins.filter((item) => item.active && (item.is_platform_owner || authUserMap.get(item.id)?.confirmed));

  const health =
    !healthResult.error &&
    healthResult.data &&
    typeof healthResult.data === "object"
      ? (healthResult.data as { version?: string; ok?: boolean; missing?: unknown })
      : null;
  const healthMissing = Array.isArray(health?.missing)
    ? health.missing.map(String)
    : [];
  const r6Health =
    !r6HealthResult.error &&
    r6HealthResult.data &&
    typeof r6HealthResult.data === "object"
      ? (r6HealthResult.data as { version?: string; ok?: boolean; missing?: unknown })
      : null;
  const r6Missing = Array.isArray(r6Health?.missing) ? r6Health.missing.map(String) : [];
  const r7Health =
    !r7HealthResult.error &&
    r7HealthResult.data &&
    typeof r7HealthResult.data === "object"
      ? (r7HealthResult.data as { version?: string; ok?: boolean; missing?: unknown })
      : null;
  const r7Missing = Array.isArray(r7Health?.missing) ? r7Health.missing.map(String) : [];
  const combinedHealthOk =
    health?.ok === true &&
    r6Health?.ok === true &&
    r7Health?.ok === true &&
    !subscriptionReadError;

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-8">
      <section className="liquid-enter">
        <div className="admin-page-hero relative overflow-hidden rounded-[28px] border border-white/[0.07] bg-white/[0.025] p-7 sm:p-9">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-violet-500/[0.08] blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <span className="liquid-badge px-3 py-1.5 text-xs text-cyan-200">Platform Owner</span>
              <span className="text-xs text-slate-600">Pusat kendali</span>
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">Pelanggan & Langganan</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Organisasi tetap menjadi identitas tenant di sistem. Di halaman Platform, setiap organisasi diperlakukan sebagai pelanggan dengan masa aktif 30 hari, lalu mode arsip/export selama 90 hari.
            </p>
          </div>
        </div>
      </section>

      {params.error ? <FlashNotice tone="error" message={params.error} /> : null}
      {params.success ? <FlashNotice tone="success" message={params.success} /> : null}

      {subscriptionReadError ? (
        <section className="mt-5">
          <div className="rounded-[18px] border border-rose-400/20 bg-rose-400/[0.055] px-5 py-4 backdrop-blur-xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-rose-100">Database langganan belum terhubung</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Source R7 sudah aktif, tetapi tabel langganan belum dapat dibaca dari Supabase Data API. Jalankan R7_1_SUBSCRIPTION_REPAIR.sql lalu npm.cmd run audit:db.
                </p>
                <p className="mt-2 break-words font-mono text-[11px] leading-5 text-rose-100/70">{subscriptionReadError}</p>
              </div>
              <span className="rounded-full border border-rose-400/20 bg-rose-400/[0.06] px-3 py-1 text-[11px] font-semibold text-rose-100">SETUP DB</span>
            </div>
          </div>
        </section>
      ) : null}

      {!combinedHealthOk && !subscriptionReadError ? (
        <section className="mt-5">
          <div className="rounded-[18px] border border-amber-400/15 bg-amber-400/[0.04] px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-amber-200">Sistem membutuhkan pemeriksaan database</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Jalankan file setup database terbaru sebelum menggunakan fitur platform. Detail teknis hanya ditampilkan saat ada masalah.
                </p>
                {[...healthMissing, ...r6Missing, ...r7Missing].length ? (
                  <p className="mt-2 break-words font-mono text-[11px] leading-5 text-amber-100/70">
                    {[...healthMissing, ...r6Missing, ...r7Missing].slice(0, 8).join(" · ")}
                  </p>
                ) : null}
              </div>
              <span className="rounded-full border border-amber-400/15 bg-amber-400/[0.06] px-3 py-1 text-[11px] font-semibold text-amber-200">PERLU DICEK</span>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Pelanggan aktif" value={activeOrganizations.filter((item) => deriveOrganizationSubscriptionState(subscriptionMap.get(item.id) ?? null).mode === "FULL").length} />
        <Metric label="Total pelanggan" value={organizations.length} />
        <Metric label="Admin aktif" value={activeAdmins.length} />
        <Metric label="Mode export" value={activeOrganizations.filter((item) => deriveOrganizationSubscriptionState(subscriptionMap.get(item.id) ?? null).mode === "EXPORT_ONLY").length} />
      </section>

      <section className="mt-7">
        <form action={createCustomerWithAdmin} className="liquid-card overflow-hidden p-0">
          <div className="grid xl:grid-cols-[1.08fr_0.92fr]">
            <div className="p-6 sm:p-7">
              <SectionTitle
                eyebrow="Onboarding Pelanggan"
                title="Buat Pelanggan Baru"
                description="Satu proses membuat organisasi, langganan 30 hari, akses Admin Utama, lalu mengirim email aktivasi. Klien membuat password sendiri dari link aman."
              />
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Field name="name" label="Nama Organisasi" placeholder="Tax Center 2028" required />
                <Field name="code" label="Kode Organisasi" placeholder="ORG-TC-2028" required />
              </div>
              <div className="mt-4"><Field name="slug" label="Slug Workspace" placeholder="tax-center-2028" required /></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <OnboardingStep number="1" label="Organisasi" detail="Tenant dibuat" />
                <OnboardingStep number="2" label="Langganan" detail="30 hari FULL" />
                <OnboardingStep number="3" label="Undangan" detail="Klien buat password" />
              </div>
            </div>

            <div className="border-t border-white/[0.06] bg-cyan-400/[0.018] p-6 sm:p-7 xl:border-l xl:border-t-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300/60">Admin Utama / PIC</p>
              <h3 className="mt-2 text-lg font-semibold text-white">Siapa yang menerima akses pertama?</h3>
              <p className="mt-2 text-xs leading-5 text-slate-600">Tidak ada password sementara. Sistem mengirim link aktivasi dan klien menentukan password pribadinya sendiri.</p>
              <div className="mt-5 space-y-4">
                <Field name="admin_full_name" label="Nama PIC / Admin Utama" placeholder="Nama lengkap" required />
                <Field name="admin_email" label="Email Admin" type="email" placeholder="admin@organisasi.id" required />
              </div>
              <div className={`mt-5 rounded-[15px] border px-4 py-3 ${resendProductionSender ? "border-emerald-400/15 bg-emerald-400/[0.04]" : resendConfigured ? "border-amber-400/15 bg-amber-400/[0.04]" : "border-rose-400/15 bg-rose-400/[0.04]"}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${resendProductionSender ? "bg-emerald-400" : resendConfigured ? "bg-amber-400" : "bg-rose-400"}`} />
                  <p className="text-xs font-semibold text-slate-200">{resendProductionSender ? "Email produksi siap" : resendConfigured ? "Resend masih mode testing" : "Email belum dikonfigurasi"}</p>
                </div>
                <p className="mt-1.5 text-[11px] leading-5 text-slate-600">
                  {resendProductionSender
                    ? "Undangan akan dikirim menggunakan sender domain yang sudah Anda konfigurasi."
                    : resendConfigured
                      ? "API key tersedia, tetapi RESEND_FROM_EMAIL belum diisi. Sender resend.dev hanya cocok untuk testing ke email akun Resend sendiri."
                      : "Isi RESEND_API_KEY dan sender email sebelum onboarding pelanggan nyata."}
                </p>
              </div>
              <button className="liquid-button-primary mt-5 w-full rounded-[14px] px-4 py-3.5 text-sm font-semibold">Buat Pelanggan & Kirim Undangan</button>
            </div>
          </div>
        </form>
      </section>

      <section className="mt-9">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div><p className="text-[11px] uppercase tracking-[0.17em] text-violet-300/60">Daftar Pelanggan</p><h2 className="mt-2 text-2xl font-semibold text-white">Organisasi Pelanggan</h2></div>
          <span className="liquid-badge px-3 py-1.5 text-xs text-slate-400">{organizations.length} pelanggan</span>
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          {organizations.map((organization) => {
            const orgMemberships = memberships.filter((m) => m.organization_id === organization.id && m.active);
            const subscription = deriveOrganizationSubscriptionState(subscriptionMap.get(organization.id) ?? null);
            return (
              <article key={organization.id} className="liquid-card p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-violet-300/70">{organization.code}</span>
                      <StatusBadge active={organization.active} />
                    </div>
                    <h3 className="mt-2 text-xl font-semibold text-white">{organization.name}</h3>
                    <p className="mt-1 text-xs text-slate-600">/{organization.slug} · {orgMemberships.filter((m) => authUserMap.get(m.user_id)?.confirmed).length} admin aktif · {orgMemberships.filter((m) => !authUserMap.get(m.user_id)?.confirmed).length} undangan</p>
                  </div>
                  <div className="rounded-[14px] border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[11px] text-slate-500">{organization.id.slice(0, 8)}</div>
                </div>

                <div className="mt-5 rounded-[18px] border border-cyan-400/10 bg-cyan-400/[0.025] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300/60">Langganan Bulanan</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <SubscriptionBadge mode={subscription.mode} />
                        <span className="text-xs text-slate-500">30 hari akses penuh · 90 hari retensi/export</span>
                      </div>
                    </div>
                    <form action={renewOrganizationSubscription.bind(null, organization.id)}>
                      <button className="liquid-button-primary rounded-[12px] px-4 py-2.5 text-xs font-semibold">+30 Hari</button>
                    </form>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[14px] border border-white/[0.05] bg-black/10 px-3 py-3">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-600">Akses penuh sampai</p>
                      <p className="mt-1 text-xs font-medium text-slate-300">{formatPlatformDate(subscription.accessUntil)}</p>
                    </div>
                    <div className="rounded-[14px] border border-white/[0.05] bg-black/10 px-3 py-3">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-600">Retensi sampai</p>
                      <p className="mt-1 text-xs font-medium text-slate-300">{formatPlatformDate(subscription.retentionUntil)}</p>
                    </div>
                  </div>
                  <form action={toggleOrganizationSubscriptionSuspension.bind(null, organization.id)} className="mt-3 flex flex-col gap-2 sm:flex-row">
                    {!subscription.suspendedAt ? (
                      <input name="reason" placeholder="Alasan suspend (opsional)" className="min-w-0 flex-1 rounded-[12px] border border-white/[0.07] bg-white/[0.025] px-3 py-2.5 text-xs text-slate-200 outline-none placeholder:text-slate-700" />
                    ) : null}
                    <ConfirmSubmitButton
                      message={subscription.suspendedAt ? `Aktifkan kembali langganan ${organization.name}?` : `Tangguhkan langganan ${organization.name}? Admin pelanggan akan kehilangan akses perubahan dan sesi peserta baru.`}
                      className={`rounded-[12px] border px-4 py-2.5 text-xs font-semibold transition ${subscription.suspendedAt ? "border-emerald-400/15 bg-emerald-400/[0.04] text-emerald-200" : "border-amber-400/15 bg-amber-400/[0.04] text-amber-200"}`}
                    >
                      {subscription.suspendedAt ? "Aktifkan Kembali" : "Tangguhkan"}
                    </ConfirmSubmitButton>
                  </form>
                  {subscription.mode === "PURGE_DUE" ? (
                    <p className="mt-3 rounded-[12px] border border-rose-400/15 bg-rose-400/[0.04] px-3 py-2 text-[11px] leading-5 text-rose-200">Retensi sudah berakhir. R7 mengunci workspace, tetapi tidak menghapus data otomatis. Penghapusan permanen sengaja dibuat manual agar data pelanggan tidak hilang karena kesalahan billing.</p>
                  ) : null}
                </div>

                <div className="mt-5 rounded-[18px] border border-white/[0.055] bg-black/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-300">Admin & Akses</p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-600">Admin pertama menjadi PIC utama secara operasional. Admin tambahan bisa diundang tanpa password sementara.</p>
                    </div>
                    <span className="liquid-badge px-2.5 py-1 text-[10px] text-slate-500">{orgMemberships.length} admin</span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {orgMemberships.length ? orgMemberships.map((membership, index) => {
                      const profile = admins.find((item) => item.id === membership.user_id);
                      const authUser = authUserMap.get(membership.user_id);
                      if (!profile) return null;
                      return (
                        <div key={membership.id} className="flex flex-col gap-3 rounded-[14px] border border-white/[0.05] bg-white/[0.018] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-xs font-semibold text-slate-200">{profile.full_name}</p>
                              {index === 0 ? <span className="rounded-full border border-violet-400/15 bg-violet-400/[0.05] px-2 py-0.5 text-[9px] font-semibold text-violet-200">ADMIN UTAMA</span> : null}
                              <AdminInviteBadge active={profile.active} confirmed={Boolean(authUser?.confirmed)} />
                            </div>
                            <p className="mt-1 truncate text-[11px] text-slate-600">{authUser?.email || "Email Auth tidak terbaca"}</p>
                          </div>
                          {!profile.is_platform_owner && authUser?.email ? (
                            <div className="flex shrink-0 flex-wrap gap-2">
                              {!authUser.confirmed ? (
                                <form action={resendOrganizationAdminInvite.bind(null, profile.id, organization.id)}>
                                  <button className="liquid-button rounded-[10px] px-3 py-2 text-[10px] font-semibold">Kirim Ulang Undangan</button>
                                </form>
                              ) : (
                                <form action={sendAdminPasswordReset.bind(null, profile.id, organization.id)}>
                                  <button className="liquid-button rounded-[10px] px-3 py-2 text-[10px] font-semibold">Kirim Link Password</button>
                                </form>
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    }) : <p className="rounded-[14px] border border-amber-400/10 bg-amber-400/[0.025] px-3 py-3 text-[11px] text-amber-100/70">Belum ada admin aktif untuk organisasi ini.</p>}
                  </div>

                  <form action={createOrganizationAdmin} className="mt-4 grid gap-3 border-t border-white/[0.055] pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <input type="hidden" name="organization_id" value={organization.id} />
                    <Field name="full_name" label="Tambah Admin" placeholder="Nama admin" required />
                    <Field name="email" label="Email" type="email" placeholder="admin@organisasi.id" required />
                    <button className="liquid-button-primary rounded-[12px] px-4 py-3 text-xs font-semibold">Kirim Undangan</button>
                  </form>
                </div>

                <form action={updateOrganization.bind(null, organization.id)} className="mt-5 rounded-[18px] border border-white/[0.055] bg-black/10 p-4">
                  <p className="text-xs font-semibold text-slate-300">Edit Organisasi</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field name="name" label="Nama" defaultValue={organization.name} required />
                    <Field name="code" label="Kode" defaultValue={organization.code} required />
                  </div>
                  <div className="mt-3"><Field name="slug" label="Slug" defaultValue={organization.slug} required /></div>
                  <button className="liquid-button mt-4 rounded-[12px] px-4 py-2.5 text-xs font-semibold">Simpan Perubahan</button>
                </form>

                <div className="mt-4 flex flex-wrap gap-2">
                  <form action={toggleOrganizationStatus.bind(null, organization.id)}>
                    <button className="liquid-button rounded-[12px] px-4 py-2.5 text-xs font-semibold">{organization.active ? "Nonaktifkan" : "Aktifkan"}</button>
                  </form>
                  <form action={deleteOrganization.bind(null, organization.id)}>
                    <ConfirmSubmitButton message={`Hapus organisasi ${organization.name}? Hanya bisa jika belum memiliki modul, batch, peserta, atau ujian.`} className="rounded-[12px] border border-rose-400/15 bg-rose-400/[0.04] px-4 py-2.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/[0.08]">Hapus Organisasi</ConfirmSubmitButton>
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div><p className="text-[11px] uppercase tracking-[0.17em] text-cyan-300/60">Akun Admin</p><h2 className="mt-2 text-2xl font-semibold text-white">Admin Platform</h2></div>
          <span className="liquid-badge px-3 py-1.5 text-xs text-slate-400">{admins.length} akun</span>
        </div>

        <div className="space-y-5">
          {admins.map((profile) => {
            const authUser = authUserMap.get(profile.id);
            const email = authUser?.email ?? "";
            const userMemberships = memberships.filter((m) => m.user_id === profile.id && m.active);
            const isSelf = profile.id === context.userId;
            return (
              <article key={profile.id} className="liquid-card p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="grid h-12 w-12 place-items-center rounded-[18px] border border-white/[0.08] bg-white/[0.045] text-slate-300"><AppIcon name="user" className="h-5 w-5" /></div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-white">{profile.full_name}</h3>
                        {profile.is_platform_owner ? <span className="rounded-full border border-cyan-400/20 bg-cyan-400/[0.07] px-2.5 py-1 text-[11px] font-semibold text-cyan-200">PLATFORM OWNER</span> : <AdminInviteBadge active={profile.active} confirmed={Boolean(authUser?.confirmed)} />}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{email || "Email Auth tidak terbaca"} · {profile.role}</p>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-600">{userMemberships.length} workspace aktif</span>
                </div>

                <form action={updateAdmin.bind(null, profile.id)} className="mt-5 rounded-[20px] border border-white/[0.055] bg-black/10 p-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field name="full_name" label="Display Name" defaultValue={profile.full_name} required />
                    <Field name="email" label="Email Login" type="email" defaultValue={email} required />
                  </div>
                  {!profile.is_platform_owner ? <p className="mt-3 text-[11px] leading-5 text-slate-600">Password tidak dikelola Platform Owner. Gunakan tombol link password pada kartu organisasi terkait agar pemilik akun membuat password sendiri.</p> : null}

                  <div className="mt-5">
                    <p className="text-xs font-medium text-slate-300">Akses Organisasi</p>
                    <p className="mt-1 text-[11px] text-slate-600">Centang workspace yang boleh diakses admin. Platform Owner tetap memiliki akses platform.</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {organizations.map((organization) => {
                        const checked = profile.is_platform_owner || userMemberships.some((m) => m.organization_id === organization.id);
                        return (
                          <label key={organization.id} className={`flex items-center gap-3 rounded-[14px] border px-3 py-3 text-xs transition ${checked ? "border-cyan-400/15 bg-cyan-400/[0.045] text-slate-200" : "border-white/[0.055] bg-white/[0.02] text-slate-500"}`}>
                            <input name="organization_ids" value={organization.id} type="checkbox" defaultChecked={checked} disabled={profile.is_platform_owner || !organization.active} className="h-4 w-4 accent-cyan-400" />
                            <span className="min-w-0"><span className="block truncate">{organization.name}</span><span className="mt-0.5 block truncate font-mono text-[11px] text-slate-600">{organization.code}{!organization.active ? " · NONAKTIF" : ""}</span></span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <button className="liquid-button mt-5 rounded-[12px] px-4 py-2.5 text-xs font-semibold">Simpan Admin</button>
                </form>

                {!profile.is_platform_owner ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <form action={toggleAdminStatus.bind(null, profile.id)}><button className="liquid-button rounded-[12px] px-4 py-2.5 text-xs font-semibold" disabled={isSelf}>{profile.active ? "Nonaktifkan Admin" : "Aktifkan Admin"}</button></form>
                    <form action={deleteAdmin.bind(null, profile.id)}><ConfirmSubmitButton message={`Hapus akun admin ${profile.full_name} beserta akses login dan membership?`} className="rounded-[12px] border border-rose-400/15 bg-rose-400/[0.04] px-4 py-2.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/[0.08]">Hapus Admin</ConfirmSubmitButton></form>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}


function OnboardingStep({ number, label, detail }: { number: string; label: string; detail: string }) {
  return <div className="rounded-[14px] border border-white/[0.055] bg-white/[0.02] px-3 py-3"><div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full border border-cyan-400/15 bg-cyan-400/[0.05] text-[10px] font-bold text-cyan-200">{number}</span><span className="text-xs font-semibold text-slate-300">{label}</span></div><p className="mt-1.5 pl-8 text-[10px] text-slate-600">{detail}</p></div>;
}

function AdminInviteBadge({ active, confirmed }: { active: boolean; confirmed: boolean }) {
  if (!active) return <span className="rounded-full border border-slate-400/10 bg-slate-400/[0.04] px-2.5 py-1 text-[10px] font-semibold text-slate-500">NONAKTIF</span>;
  if (!confirmed) return <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.07] px-2.5 py-1 text-[10px] font-semibold text-amber-200">UNDANGAN</span>;
  return <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-2.5 py-1 text-[10px] font-semibold text-emerald-200">AKUN AKTIF</span>;
}

function formatPlatformDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function SubscriptionBadge({ mode }: { mode: ReturnType<typeof deriveOrganizationSubscriptionState>["mode"] }) {
  const style =
    mode === "FULL"
      ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200"
      : mode === "EXPORT_ONLY"
        ? "border-amber-400/20 bg-amber-400/[0.07] text-amber-200"
        : "border-rose-400/20 bg-rose-400/[0.07] text-rose-200";
  const label = mode === "FULL" ? "AKTIF" : mode === "EXPORT_ONLY" ? "EXPORT ONLY" : mode === "PURGE_DUE" ? "RETENSI HABIS" : mode === "SUSPENDED" ? "SUSPENDED" : "BELUM SIAP";
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${style}`}>{label}</span>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="liquid-card p-5"><p className="text-[11px] uppercase tracking-[0.14em] text-slate-600">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-100">{value}</p></div>;
}

function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div><p className="text-[11px] uppercase tracking-[0.16em] text-violet-300/60">{eyebrow}</p><h2 className="mt-2 text-xl font-semibold text-white">{title}</h2><p className="mt-2 text-xs leading-5 text-slate-600">{description}</p></div>;
}

function Field({ name, label, type = "text", placeholder, defaultValue, required = false }: { name: string; label: string; type?: string; placeholder?: string; defaultValue?: string; required?: boolean }) {
  return <label className="block"><span className="mb-2 block text-xs text-slate-400">{label}</span><input name={name} type={type} placeholder={placeholder} defaultValue={defaultValue} required={required} className="w-full rounded-[14px] border border-white/[0.07] bg-white/[0.025] px-4 py-3 text-sm text-slate-200 outline-none transition placeholder:text-slate-700 focus:border-cyan-400/20 focus:bg-cyan-400/[0.025]" /></label>;
}

function StatusBadge({ active }: { active: boolean }) {
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${active ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200" : "border-slate-400/10 bg-slate-400/[0.04] text-slate-500"}`}>{active ? "AKTIF" : "NONAKTIF"}</span>;
}
