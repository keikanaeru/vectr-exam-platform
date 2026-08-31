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
      <section className="r9-surface px-6 py-8 sm:px-8">
        <div className="flex flex-wrap items-center gap-2"><span className="r9-badge">{organization.name}</span><span className="font-mono text-xs text-cyan-300/70">{module.code}</span></div>
        <h1 className="mt-5 text-3xl font-bold text-slate-100">Import Bank Soal</h1>
        <p className="mt-3 text-sm text-slate-400">{module.name}</p>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <QuestionImportForm moduleId={id} />
        <aside className="space-y-4">
          <div className="r9-surface p-5"><div><p className="text-xs font-semibold text-slate-100">Format Template</p><p className="mt-2 text-[11px] leading-5 text-slate-500">Kode Soal, Pertanyaan, Opsi A-D, Kunci Jawaban, Bobot, Status.</p><Link href={`/admin/modules/${id}/questions/import/template`} className="r9-button r9-button--secondary mt-4 w-full">Download Template Excel</Link></div></div>
          <Link href={`/admin/modules/${id}`} className="r9-button r9-button--secondary w-full">← Kembali ke Bank Soal</Link>
        </aside>
      </section>
    </main>
  );
}
