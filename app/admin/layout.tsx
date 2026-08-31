import "./r9-tokens.css";
import "./r9/primitives.css";
import "./r9/shell.css";
import "./r9/overview.css";

import Link from "next/link";
import { redirect } from "next/navigation";

import { getAdminContext } from "@/lib/admin-context";
import VectrBrand from "@/app/ui/VectrBrand";
import AdminNav from "./AdminNav";
import OrganizationSwitcher from "./OrganizationSwitcher";
import AdminAccountMenu from "./AdminAccountMenu";
import { setActiveOrganization } from "./organization-actions";
import AdminSubscriptionGate from "./AdminSubscriptionGate";
import AdminActionScrollMemory from "./ui/AdminActionScrollMemory";
import { getCachedOrganizationSubscriptionState } from "@/lib/organization-subscription";
import { getCachedAdminDatabaseHealth } from "@/lib/admin-database-health";


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
      <div className="admin-shell r9-admin admin-performance-shell relative min-h-screen">
        <div className="fixed right-5 top-5 z-50">
          <AdminAccountMenu fullName={context.profile.fullName} role={context.profile.globalRole || "ADMIN"} />
        </div>
        <main className="flex min-h-screen items-center justify-center px-6">

        <div className="r9-surface max-w-lg p-8 text-center">

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

  const [subscriptionState, databaseHealth] = await Promise.all([
    getCachedOrganizationSubscriptionState(
      organization.organizationId
    ),
    getCachedAdminDatabaseHealth(),
  ]);


  const databaseMissing = Array.isArray(databaseHealth?.missing)
    ? databaseHealth.missing.map(String)
    : [];
  const databaseReady = databaseHealth?.ok === true;


  // =====================================
  // UI
  // =====================================

  return (
    <div className="admin-shell r9-admin admin-performance-shell relative isolate min-h-screen overflow-x-clip">

      <AdminActionScrollMemory />

      <div className="relative z-10">

      {/* ================================= */}
      {/* FLOATING GLASS HEADER */}
      {/* ================================= */}

      <div className="r9-shell-stage">

        <header className="r9-shell-header overflow-visible">

          <div className="px-4 sm:px-6">

            {/* ================================= */}
            {/* TOP BAR */}
            {/* ================================= */}

            <div className="r9-shell-topbar">

              {/* ================================= */}
              {/* BRAND + ORGANIZATION */}
              {/* ================================= */}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">

                {/* BRAND */}

                <Link
                  href="/admin"
                  className="r9-shell-brand"
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

                  <div className="r9-workspace-chip">

                    <span className="r9-workspace-chip__signal" aria-hidden="true" />


                    <span className="r9-workspace-chip__name">
                      {organization.name}
                    </span>

                  </div>

                )}

              </div>


              {/* ================================= */}
              {/* ADMIN INFO */}
              {/* ================================= */}

              <div className="r9-shell-account">

                <AdminAccountMenu
                  fullName={context.profile.fullName}
                  role={context.organizationRole ?? context.profile.globalRole ?? "ADMIN"}
                />


                {isPlatformOwner && (

                  <span className="r9-owner-badge">
                    PLATFORM OWNER
                  </span>

                )}

              </div>

            </div>


            {/* ================================= */}
            {/* NAVIGATION */}
            {/* ================================= */}

            <div className="r9-shell-divider" />


            <div className="r9-shell-nav">

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

        <div className="r9-workspace-context text-xs">

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

              <span className="hidden text-[11px] uppercase tracking-[0.14em] text-cyan-300/60 sm:inline">
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

      <div className="r9-page-stage">
        <AdminSubscriptionGate state={subscriptionState} isPlatformOwner={isPlatformOwner}>
          {children}
        </AdminSubscriptionGate>
      </div>

      </div>

    </div>
  );
}
