import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminReadAccess } from "@/lib/organization-subscription";

import GlassSelect from "@/app/admin/ui/GlassSelect";
import ConfirmSubmitButton from "@/app/admin/ui/ConfirmSubmitButton";
import FlashNotice from "@/app/ui/FlashNotice";

import {
  createQuestion,
  deleteQuestion,
  toggleQuestionStatus,
  updateQuestion,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { error?: string; success?: string };
type OptionItem = { id: string; text: string };

function readOptions(value: unknown): OptionItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const data = item as { id?: unknown; text?: unknown };
      const id = typeof data.id === "string" ? data.id.toUpperCase() : "";
      const text = typeof data.text === "string" ? data.text : "";
      return id && text ? { id, text } : null;
    })
    .filter((item): item is OptionItem => Boolean(item));
}

export default async function ModuleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const errorMessage = typeof query.error === "string" ? query.error : "";
  const successMessage = typeof query.success === "string" ? query.success : "";

  const { organizationId, organization } = await requireAdminReadAccess();
  const supabase = createAdminClient();

  const { data: module, error: moduleError } = await supabase
    .from("modules")
    .select("id, code, name, description, default_duration_minutes, status")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (moduleError || !module) notFound();

  const { data: questions, error: questionError } = await supabase
    .from("questions")
    .select("id, code, question_text, options, correct_option_id, weight, status, created_at")
    .eq("module_id", id)
    .order("created_at", { ascending: true });

  if (questionError) throw new Error("Gagal membaca bank soal.");

  const addQuestion = createQuestion.bind(null, id);
  const activeCount = (questions ?? []).filter((question) => question.status === "ACTIVE").length;

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-8">
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/modules" className="liquid-button rounded-[13px] px-4 py-2.5 text-xs font-semibold text-slate-200">← Kembali</Link>
        <Link href={`/admin/modules/${id}/questions/import`} className="liquid-button-primary rounded-[13px] px-4 py-2.5 text-xs font-semibold">↥ Import Bank Soal</Link>
        <Link href={`/admin/modules/${id}/questions/export/xlsx`} className="liquid-button rounded-[13px] px-4 py-2.5 text-xs font-semibold text-emerald-200">Export Excel</Link>
        <Link href={`/admin/modules/${id}/questions/import/template`} className="liquid-button rounded-[13px] px-4 py-2.5 text-xs font-semibold text-cyan-200">Template Soal</Link>
      </div>

      <section className="admin-page-hero mt-5 relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-white/[0.025] px-6 py-8 backdrop-blur-xl sm:px-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs tracking-[0.14em] text-blue-300/80">{module.code}</span>
            <span className={module.status === "ACTIVE" ? "liquid-badge liquid-badge-success px-2.5 py-1 text-[11px] font-semibold" : "liquid-badge px-2.5 py-1 text-[11px] text-slate-400"}>{module.status}</span>
            <span className="liquid-badge px-2.5 py-1 text-[11px] text-slate-400">{organization.name}</span>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">{module.name}</h1>
          {module.description ? <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{module.description}</p> : null}
          <div className="mt-5 flex flex-wrap gap-3 text-xs text-slate-500">
            <span>{questions?.length ?? 0} soal</span>
            <span className="text-emerald-300/70">{activeCount} aktif</span>
            <span>{module.default_duration_minutes} menit default</span>
          </div>
        </div>
      </section>

      {errorMessage ? <FlashNotice tone="error" message={errorMessage} /> : null}
      {successMessage ? <FlashNotice tone="success" message={successMessage} /> : null}

      <section className="mt-6 grid gap-6 lg:grid-cols-[390px_1fr]">
        <form action={addQuestion} className="liquid-card h-fit p-6">
          <div className="relative z-10">
            <p className="text-[11px] uppercase tracking-[0.18em] text-blue-300/65">Manual Question</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Tambah Soal</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">Untuk banyak soal, gunakan Import Bank Soal Excel.</p>

            <QuestionFields />

            <button type="submit" className="liquid-button-primary mt-5 w-full rounded-[14px] px-4 py-3 text-sm font-semibold">Simpan Soal</button>
          </div>
        </form>

        <div>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Bank Soal</h2>
              <p className="mt-1 text-xs text-slate-500">Edit, aktif/nonaktif, dan hapus soal yang belum dipakai.</p>
            </div>
            <span className="liquid-badge px-3 py-1.5 text-xs text-slate-400">{questions?.length ?? 0} soal</span>
          </div>

          <div className="space-y-4">
            {questions?.length ? (
              questions.map((question, index) => {
                const options = readOptions(question.options);
                const optionMap = new Map(options.map((option) => [option.id, option.text]));
                const edit = updateQuestion.bind(null, id, question.id);
                const toggle = toggleQuestionStatus.bind(null, id, question.id);
                const remove = deleteQuestion.bind(null, id, question.id);

                return (
                  <article key={question.id} className="liquid-card p-5 sm:p-6">
                    <div className="relative z-10">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="flex h-8 min-w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] px-2 text-xs font-semibold text-slate-300">{index + 1}</span>
                            <span className="font-mono text-xs text-blue-300/75">{question.code}</span>
                            <span className={question.status === "ACTIVE" ? "liquid-badge liquid-badge-success px-2.5 py-1 text-[11px] font-semibold" : "liquid-badge px-2.5 py-1 text-[11px] text-slate-500"}>{question.status}</span>
                            <span className="liquid-badge px-2.5 py-1 text-[11px] text-slate-500">Bobot {question.weight}</span>
                          </div>
                          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-200">{question.question_text}</p>

                          <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            {["A", "B", "C", "D"].map((letter) => (
                              <div key={letter} className={question.correct_option_id === letter ? "rounded-[14px] border border-emerald-400/15 bg-emerald-400/[0.04] p-3 text-xs text-emerald-100" : "rounded-[14px] border border-white/[0.055] bg-black/10 p-3 text-xs text-slate-400"}>
                                <span className="mr-2 font-semibold">{letter}.</span>{optionMap.get(letter) ?? "-"}
                              </div>
                            ))}
                          </div>
                        </div>

                        <form action={toggle}>
                          <button type="submit" className="liquid-button rounded-[12px] px-3 py-2 text-[11px] font-semibold text-slate-300">{question.status === "ACTIVE" ? "Nonaktifkan" : "Aktifkan"}</button>
                        </form>
                      </div>

                      <details className="mt-4 rounded-[17px] border border-white/[0.06] bg-black/10 p-4">
                        <summary className="cursor-pointer list-none text-xs font-medium text-slate-400">Edit soal</summary>
                        <form action={edit} className="mt-4">
                          <QuestionFields
                            defaults={{
                              code: question.code,
                              questionText: question.question_text,
                              optionA: optionMap.get("A") ?? "",
                              optionB: optionMap.get("B") ?? "",
                              optionC: optionMap.get("C") ?? "",
                              optionD: optionMap.get("D") ?? "",
                              correctOption: question.correct_option_id,
                              weight: Number(question.weight),
                              status: question.status,
                            }}
                          />
                          <button type="submit" className="liquid-button-primary mt-4 w-full rounded-[13px] px-4 py-3 text-xs font-semibold">Simpan Perubahan Soal</button>
                        </form>
                        <form action={remove} className="mt-3">
                          <ConfirmSubmitButton message={`Hapus soal ${question.code}? Soal yang sudah pernah digunakan pada sesi ujian tidak dapat dihapus.`} className="w-full rounded-[13px] border border-rose-400/15 bg-rose-400/[0.04] px-4 py-3 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/[0.08]">Hapus Soal</ConfirmSubmitButton>
                        </form>
                      </details>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="liquid-card p-12 text-center text-sm text-slate-500">Belum ada soal. Tambah manual atau gunakan Import Bank Soal.</div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function QuestionFields({
  defaults,
}: {
  defaults?: {
    code: string;
    questionText: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    correctOption: string;
    weight: number;
    status: string;
  };
}) {
  return (
    <div className="mt-5 space-y-3">
      <input name="code" defaultValue={defaults?.code ?? ""} placeholder="Kode soal, mis. Q-001" required className="liquid-input p-3" />
      <textarea name="question_text" defaultValue={defaults?.questionText ?? ""} placeholder="Pertanyaan" required rows={4} className="liquid-input resize-none p-3" />
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="option_a" defaultValue={defaults?.optionA ?? ""} placeholder="Pilihan A" required className="liquid-input p-3" />
        <input name="option_b" defaultValue={defaults?.optionB ?? ""} placeholder="Pilihan B" required className="liquid-input p-3" />
        <input name="option_c" defaultValue={defaults?.optionC ?? ""} placeholder="Pilihan C" required className="liquid-input p-3" />
        <input name="option_d" defaultValue={defaults?.optionD ?? ""} placeholder="Pilihan D" required className="liquid-input p-3" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <GlassSelect
          name="correct_option"
          defaultValue={defaults?.correctOption ?? "A"}
          options={["A", "B", "C", "D"].map((value) => ({ value, label: `Kunci ${value}` }))}
        />
        <input name="weight" type="number" min={0} max={1000} step="0.01" defaultValue={defaults?.weight ?? 1} required className="liquid-input p-3" />
      </div>
      {defaults ? (
        <GlassSelect
          name="status"
          defaultValue={defaults.status}
          options={[
            { value: "ACTIVE", label: "Aktif" },
            { value: "INACTIVE", label: "Nonaktif" },
          ]}
        />
      ) : (
        <input type="hidden" name="status" value="ACTIVE" />
      )}
    </div>
  );
}

