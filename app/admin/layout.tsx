import Link from "next/link";
import { redirect } from "next/navigation";

import { getAdminContext } from "@/lib/admin-context";
import { createAdminClient } from "@/lib/supabase/admin";
import VectrBrand from "@/app/ui/VectrBrand";
import AdminNav from "./AdminNav";
import OrganizationSwitcher from "./OrganizationSwitcher";
import AdminAccountMenu from "./AdminAccountMenu";
import { setActiveOrganization } from "./organization-actions";
import AdminSubscriptionGate from "./AdminSubscriptionGate";
import AdminActionScrollMemory from "./ui/AdminActionScrollMemory";
import { getOrganizationSubscriptionState } from "@/lib/organization-subscription";


export const dynamic =
  "force-dynamic";


export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context =
    await getAdminContext();


  // =====================================
  // LOGIN / ADMIN VALIDATION
  // =====================================

  if (!context) {
    redirect(
      "/login"
    );
  }


  // =====================================
  // HARUS PUNYA ORGANISASI
  // =====================================

  if (
    !context.activeOrganization
  ) {
    return (
      <div className="admin-shell admin-performance-shell relative min-h-screen">
        <div className="fixed right-5 top-5 z-50">
          <AdminAccountMenu fullName={context.profile.fullName} role={context.profile.globalRole || "ADMIN"} />
        </div>
        <main className="flex min-h-screen items-center justify-center px-6">

        <div className="liquid-card liquid-enter max-w-lg p-8 text-center">

          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xl shadow-lg backdrop-blur-xl">
            !
          </div>


          <h1 className="text-2xl font-bold tracking-tight text-white">
            Belum Ada Organisasi
          </h1>


          <p className="mt-3 leading-relaxed text-slate-400">
            Akun admin ini belum terhubung dengan
            organisasi aktif.
          </p>

        </div>

        </main>
      </div>
    );
  }


  const organization =
    context.activeOrganization;


  const isPlatformOwner =
    context.profile.isPlatformOwner;

  const subscriptionState = await getOrganizationSubscriptionState(
    createAdminClient(),
    organization.organizationId
  );


  // Database contract check dipanggil dari layout agar mismatch schema
  // terlihat sebelum admin menekan mutation satu per satu.
  const healthResult = await createAdminClient().rpc("exam_platform_healthcheck");
  const databaseHealth =
    !healthResult.error &&
    healthResult.data &&
    typeof healthResult.data === "object"
      ? (healthResult.data as { version?: string; ok?: boolean; missing?: unknown })
      : null;
  const databaseMissing = Array.isArray(databaseHealth?.missing)
    ? databaseHealth.missing.map(String)
    : [];
  const databaseReady = databaseHealth?.ok === true;


  // =====================================
  // UI
  // =====================================

  return (
    <div className="admin-shell admin-performance-shell relative isolate min-h-screen overflow-x-clip">

      <AdminActionScrollMemory />

      <div className="relative z-10">

      {/* ================================= */}
      {/* FLOATING GLASS HEADER */}
      {/* ================================= */}

      <div className="admin-header-stage sticky top-0 z-50 px-3 pt-3 sm:px-5">

        <header className="admin-header-nav liquid-nav mx-auto max-w-7xl overflow-visible rounded-[24px]">

          <div className="px-4 sm:px-6">

            {/* ================================= */}
            {/* TOP BAR */}
            {/* ================================= */}

            <div className="flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">

              {/* ================================= */}
              {/* BRAND + ORGANIZATION */}
              {/* ================================= */}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">

                {/* BRAND */}

                <Link
                  href="/admin"
                  className="group flex items-center gap-3"
                >

                  <VectrBrand compact subtitle="Exam Platform · Administration" />

                </Link>


                {/* ================================= */}
                {/* PLATFORM OWNER:
                    ORGANIZATION SWITCHER */}
                {/* ================================= */}

                {isPlatformOwner ? (

                  <OrganizationSwitcher
                    organizations={
                      context.organizations.map(
                        (item) => ({
                          id:
                            item.organizationId,

                          name:
                            item.name,
                        })
                      )
                    }
                    activeOrganizationId={
                      organization.organizationId
                    }
                    switchAction={
                      setActiveOrganization
                    }
                  />

                ) : (

                  /* ================================= */
                  /* ORG ADMIN:
                     STATIC ORGANIZATION */
                  /* ================================= */

                  <div className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-2.5 backdrop-blur-xl">

                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />


                    <span className="text-sm font-medium text-slate-300">
                      {organization.name}
                    </span>

                  </div>

                )}

              </div>


              {/* ================================= */}
              {/* ADMIN INFO */}
              {/* ================================= */}

              <div className="flex flex-wrap items-center gap-2 text-sm">

                <AdminAccountMenu
                  fullName={context.profile.fullName}
                  role={context.organizationRole ?? context.profile.globalRole ?? "ADMIN"}
                />


                {isPlatformOwner && (

                  <span className="liquid-badge liquid-badge-success px-3 py-1.5 text-[11px] font-semibold tracking-wide">
                    PLATFORM OWNER
                  </span>

                )}

              </div>

            </div>


            {/* ================================= */}
            {/* NAVIGATION */}
            {/* ================================= */}

            <div className="liquid-divider" />


            <div className="overflow-x-auto py-2">

              <AdminNav
                isPlatformOwner={
                  isPlatformOwner
                }
              />

            </div>

          </div>

        </header>

      </div>


      {/* ================================= */}
      {/* ORGANIZATION CONTEXT */}
      {/* ================================= */}

      <div className="mx-auto mt-3 max-w-7xl px-5 sm:px-8">

        <div className="flex flex-col gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 py-2.5 text-xs backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">

          <div className="flex items-center gap-2 text-slate-500">

            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />


            <span>
              {isPlatformOwner
                ? "Workspace aktif"
                : "Organisasi"}
            </span>


            <span className="font-medium text-slate-300">
              {organization.name}
            </span>

          </div>


          <div className="flex items-center gap-3">

            {isPlatformOwner && (

              <span className="hidden text-[11px] uppercase tracking-[0.14em] text-blue-300/40 sm:inline">
                Platform Workspace
              </span>

            )}


            <span className="font-mono text-[11px] tracking-wide text-slate-600">
              {organization.code}
            </span>

            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
              subscriptionState.mode === "FULL"
                ? "border-emerald-400/15 bg-emerald-400/[0.05] text-emerald-200"
                : subscriptionState.mode === "EXPORT_ONLY"
                  ? "border-amber-400/15 bg-amber-400/[0.05] text-amber-200"
                  : "border-rose-400/15 bg-rose-400/[0.05] text-rose-200"
            }`}>
              {subscriptionState.mode === "FULL" ? `AKTIF · ${Math.max(0, subscriptionState.daysUntilExpiry ?? 0)} HARI` : subscriptionState.mode === "EXPORT_ONLY" ? `EXPORT · ${Math.max(0, subscriptionState.daysUntilRetentionEnds ?? 0)} HARI` : subscriptionState.mode.replaceAll("_", " ")}
            </span>

          </div>

        </div>

      </div>


      {!isPlatformOwner && subscriptionState.mode === "EXPORT_ONLY" ? (
        <div className="mx-auto mt-3 max-w-7xl px-5 sm:px-8">
          <div className="rounded-[18px] border border-amber-400/20 bg-amber-400/[0.055] px-4 py-3 backdrop-blur-xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-amber-100">Mode arsip · hanya lihat & export</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-400">
                  Masa aktif langganan sudah berakhir. Perubahan data, import, komunikasi, pengaturan ujian, dan sesi peserta baru dinonaktifkan sampai langganan diperpanjang.
                </p>
              </div>
              <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.06] px-3 py-1 text-[11px] font-semibold text-amber-100">EXPORT ONLY</span>
            </div>
          </div>
        </div>
      ) : !isPlatformOwner && subscriptionState.mode === "FULL" && (subscriptionState.daysUntilExpiry ?? 999) <= 7 ? (
        <div className="mx-auto mt-3 max-w-7xl px-5 sm:px-8">
          <div className="rounded-[18px] border border-cyan-400/15 bg-cyan-400/[0.035] px-4 py-3 backdrop-blur-xl">
            <p className="text-xs font-semibold text-cyan-100">Langganan berakhir dalam {Math.max(0, subscriptionState.daysUntilExpiry ?? 0)} hari</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">Hubungi pengelola platform sebelum masa aktif berakhir agar akses admin dan sesi peserta baru tidak terhenti.</p>
          </div>
        </div>
      ) : null}

      {!databaseReady ? (
        <div className="mx-auto mt-3 max-w-7xl px-5 sm:px-8">
          <div className="rounded-[18px] border border-rose-400/20 bg-rose-400/[0.055] px-4 py-3 backdrop-blur-xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-rose-200">Database belum siap digunakan</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-400">
                  {databaseHealth
                    ? "Jalankan setup database terbaru sampai healthcheck berstatus OK sebelum menggunakan fitur admin atau peserta."
                    : "Healthcheck belum tersedia. Jalankan file setup database terbaru di Supabase SQL Editor."}
                </p>
                {databaseMissing.length ? (
                  <p className="mt-1 break-words font-mono text-[11px] leading-5 text-rose-100/70">
                    {databaseMissing.slice(0, 6).join(" · ")}{databaseMissing.length > 6 ? ` · +${databaseMissing.length - 6} lainnya` : ""}
                  </p>
                ) : null}
              </div>
              <span className="rounded-full border border-rose-400/20 bg-rose-400/[0.06] px-3 py-1 text-[11px] font-semibold text-rose-200">PERLU DICEK</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* ================================= */}
      {/* PAGE CONTENT */}
      {/* ================================= */}

      <div className="liquid-enter">
        <AdminSubscriptionGate state={subscriptionState} isPlatformOwner={isPlatformOwner}>
          {children}
        </AdminSubscriptionGate>
      </div>

      </div>

    </div>
  );
}