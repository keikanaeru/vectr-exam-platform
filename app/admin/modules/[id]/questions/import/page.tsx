import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminReadAccess } from "@/lib/organization-subscription";

import QuestionImportForm from "./QuestionImportForm";

export const dynamic = "force-dynamic";

export default async function QuestionImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId, organization } = await requireAdminReadAccess();
  const supabase = createAdminClient();

  const { data: module } = await supabase
    .from("modules")
    .select("id, code, name")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!module) notFound();

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-8">
      <section className="admin-page-hero relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-white/[0.025] px-6 py-8 backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-24 -top-24 h-60 w-60 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2"><span className="liquid-badge px-3 py-1.5 text-xs text-slate-300">{organization.name}</span><span className="font-mono text-xs text-cyan-300/70">{module.code}</span></div>
          <h1 className="mt-5 text-3xl font-bold text-white">Import Bank Soal</h1>
          <p className="mt-3 text-sm text-slate-400">{module.name}</p>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <QuestionImportForm moduleId={id} />
        <aside className="space-y-4">
          <div className="liquid-card p-5"><div className="relative z-10"><p className="text-xs font-semibold text-slate-200">Format Template</p><p className="mt-2 text-[11px] leading-5 text-slate-500">Kode Soal, Pertanyaan, Opsi A-D, Kunci Jawaban, Bobot, Status.</p><Link href={`/admin/modules/${id}/questions/import/template`} className="liquid-button mt-4 flex w-full rounded-[13px] px-4 py-3 text-xs font-semibold text-cyan-200">Download Template Excel</Link></div></div>
          <Link href={`/admin/modules/${id}`} className="liquid-button flex w-full rounded-[13px] px-4 py-3 text-xs font-semibold text-slate-200">← Kembali ke Bank Soal</Link>
        </aside>
      </section>
    </main>
  );
}
