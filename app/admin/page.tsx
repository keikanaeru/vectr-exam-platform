import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminReadAccess } from "@/lib/organization-subscription";
import AppIcon from "@/app/ui/AppIcon";

export const dynamic = "force-dynamic";


export default async function AdminPage() {
  // =====================================
  // ORGANISASI AKTIF
  // =====================================

  const {
    organizationId,
    organization,
  } =
    await requireAdminReadAccess();


  const supabase =
    createAdminClient();


  // =====================================
  // DASHBOARD COUNTS
  // =====================================

  const [
    moduleResult,
    participantResult,
    examResult,
  ] = await Promise.all([

    supabase
      .from("modules")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq(
        "organization_id",
        organizationId
      ),


    supabase
      .from("candidates")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "active",
        true
      ),


    supabase
      .from("exams")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "status",
        "ACTIVE"
      ),

  ]);


  const moduleCount =
    moduleResult.count ?? 0;

  const participantCount =
    participantResult.count ?? 0;

  const examCount =
    examResult.count ?? 0;


  // =====================================
  // UI
  // =====================================

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-8">

      {/* ================================= */}
      {/* HERO */}
      {/* ================================= */}

      <section className="liquid-enter">

        <div className="admin-page-hero relative overflow-hidden rounded-[28px] border border-white/[0.07] bg-white/[0.025] px-6 py-8 backdrop-blur-xl sm:px-8">

          {/* DECORATIVE GLOW */}

          <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />

          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-violet-500/[0.07] blur-3xl" />


          <div className="relative">

            <div className="flex flex-wrap items-center gap-3">

              <span className="liquid-badge px-3 py-1.5 text-xs font-medium text-slate-300">
                {organization.name}
              </span>


              <span className="flex items-center gap-2 text-xs text-slate-500">

                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />

                Workspace aktif

              </span>

            </div>


            <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Dashboard Admin
            </h1>


            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Ringkasan sistem ujian untuk organisasi{" "}
              <span className="font-medium text-slate-200">
                {organization.name}
              </span>
              .
            </p>

          </div>

        </div>

      </section>


      {/* ================================= */}
      {/* STAT CARDS */}
      {/* ================================= */}

      <section className="mt-6 grid gap-4 md:grid-cols-3">

        {/* MODULE CARD */}

        <Link
          href="/admin/modules"
          className="liquid-card liquid-card-interactive group block p-6"
        >

          <div className="relative z-10">

            <div className="flex items-start justify-between gap-4">

              <div>

                <p className="text-sm font-medium text-slate-400">
                  Modul
                </p>

                <p className="mt-3 text-4xl font-bold tracking-tight text-white">
                  {moduleCount}
                </p>

              </div>


              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-400/15 bg-blue-400/[0.07] text-blue-300 shadow-[0_0_30px_rgba(59,130,246,0.08)]">
                <AppIcon name="modules" className="h-5 w-5" />
              </div>

            </div>


            <div className="mt-8 flex items-center justify-between">

              <p className="text-xs text-slate-500">
                Bank soal & konfigurasi
              </p>

              <span className="translate-x-0 text-sm text-slate-500 transition duration-200 group-hover:translate-x-1 group-hover:text-blue-300">
                →
              </span>

            </div>

          </div>

        </Link>


        {/* PARTICIPANT CARD */}

        <Link
          href="/admin/participants"
          className="liquid-card liquid-card-interactive group block p-6"
        >

          <div className="relative z-10">

            <div className="flex items-start justify-between gap-4">

              <div>

                <p className="text-sm font-medium text-slate-400">
                  Peserta
                </p>

                <p className="mt-3 text-4xl font-bold tracking-tight text-white">
                  {participantCount}
                </p>

              </div>


              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-400/15 bg-violet-400/[0.07] text-violet-300 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
                <AppIcon name="participants" className="h-5 w-5" />
              </div>

            </div>


            <div className="mt-8 flex items-center justify-between">

              <p className="text-xs text-slate-500">
                Peserta aktif
              </p>

              <span className="translate-x-0 text-sm text-slate-500 transition duration-200 group-hover:translate-x-1 group-hover:text-violet-300">
                →
              </span>

            </div>

          </div>

        </Link>


        {/* ACTIVE EXAM CARD */}

        <Link
          href="/admin/exams"
          className="liquid-card liquid-card-interactive group block p-6"
        >

          <div className="relative z-10">

            <div className="flex items-start justify-between gap-4">

              <div>

                <div className="flex items-center gap-2">

                  <p className="text-sm font-medium text-slate-400">
                    Ujian Aktif
                  </p>


                  {examCount > 0 && (

                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.85)]" />

                  )}

                </div>


                <p className="mt-3 text-4xl font-bold tracking-tight text-white">
                  {examCount}
                </p>

              </div>


              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300 shadow-[0_0_30px_rgba(16,185,129,0.08)]">
                <AppIcon name="exams" className="h-5 w-5" />
              </div>

            </div>


            <div className="mt-8 flex items-center justify-between">

              <p className="text-xs text-slate-500">
                Sesi yang sedang tersedia
              </p>

              <span className="translate-x-0 text-sm text-slate-500 transition duration-200 group-hover:translate-x-1 group-hover:text-emerald-300">
                →
              </span>

            </div>

          </div>

        </Link>

      </section>


      {/* ================================= */}
      {/* QUICK ACTIONS */}
      {/* ================================= */}

      <section className="mt-6">

        <div className="liquid-card p-6">

          <div className="relative z-10">

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

              <div>

                <p className="text-sm font-semibold text-white">
                  Quick Actions
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Akses cepat ke pengelolaan sistem ujian.
                </p>

              </div>


              <div className="flex flex-wrap gap-2">

                <Link
                  href="/admin/modules"
                  className="liquid-button px-4 py-2.5 text-sm"
                >
                  Kelola Modul
                </Link>


                <Link
                  href="/admin/participants"
                  className="liquid-button px-4 py-2.5 text-sm"
                >
                  Kelola Peserta
                </Link>


                <Link
                  href="/admin/exams"
                  className="liquid-button-primary rounded-[14px] px-4 py-2.5 text-sm font-medium"
                >
                  Kelola Ujian
                </Link>

              </div>

            </div>

          </div>

        </div>

      </section>

    </main>
  );
}