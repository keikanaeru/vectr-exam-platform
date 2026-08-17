import Link from "next/link";
import VectrBrand from "@/app/ui/VectrBrand";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden px-6 py-10 text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-40 top-10 h-[520px] w-[520px] rounded-full bg-blue-500/[0.09] blur-[150px]" />
        <div className="absolute -right-48 top-1/3 h-[520px] w-[520px] rounded-full bg-violet-500/[0.08] blur-[150px]" />
        <div className="absolute bottom-[-220px] left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-cyan-500/[0.06] blur-[150px]" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col">
        <header className="flex items-center justify-between rounded-[22px] border border-white/[0.07] bg-white/[0.025] px-4 py-3 backdrop-blur-2xl sm:px-5">
          <VectrBrand compact subtitle="Exam Platform" />
          <Link href="/login" className="rounded-[13px] border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/20 hover:bg-cyan-300/[0.06]">Login Admin</Link>
        </header>

        <section className="flex flex-1 items-center py-14 lg:py-20">
          <div className="grid w-full gap-10 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
            <div className="liquid-enter">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/10 bg-emerald-400/[0.035] px-3 py-2 text-[10px] font-medium text-emerald-200/80"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_9px_rgba(52,211,153,.8)]" />VECTR · Platform ujian multi-organisasi</div>
              <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-[1.08] tracking-[-0.04em] sm:text-6xl">Ujian, kompetisi, dan sertifikasi dalam satu platform yang terkontrol.</h1>
              <p className="mt-6 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">Organisasi, admin, bank soal, import peserta, jadwal, kredensial unik, pengerjaan ujian, dan ekspor hasil dibuat dalam satu alur yang konsisten.</p>
              <div className="mt-8 flex flex-wrap gap-3"><Link href="/login" className="liquid-button-primary rounded-[15px] px-6 py-3.5 text-sm font-semibold">Masuk Dashboard Admin</Link><span className="rounded-[15px] border border-white/[0.06] bg-white/[0.02] px-5 py-3.5 text-xs text-slate-500">Peserta masuk melalui tautan peserta dari penyelenggara</span></div>
            </div>

            <div className="relative">
              <div className="absolute -inset-6 rounded-[40px] bg-gradient-to-br from-cyan-500/[0.06] via-transparent to-violet-500/[0.08] blur-2xl" />
              <div className="relative rounded-[30px] border border-white/[0.08] bg-white/[0.035] p-5 shadow-2xl backdrop-blur-3xl sm:p-6">
                <div className="flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-[0.18em] text-slate-600">Alur Platform</p><p className="mt-1 text-sm font-semibold text-slate-200">Operasional Ujian</p></div><span className="rounded-full border border-cyan-400/10 bg-cyan-400/[0.04] px-3 py-1.5 text-[10px] font-medium text-cyan-200">SIAP OPERASIONAL</span></div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Feature index="01" title="Peserta & Akses" text="Organisasi, admin, batch peserta, serta impor Excel/CSV." />
                  <Feature index="02" title="Bank Soal" text="Bank soal, template, impor, duplikasi, dan ekspor Excel." />
                  <Feature index="03" title="Operasional Ujian" text="Jadwal WIB, sinkron peserta, kode akses unik, buka/tutup login." />
                  <Feature index="04" title="Output & Arsip" text="Kredensial Word/PDF/Excel dan hasil ujian per modul maupun keseluruhan." />
                </div>
                <div className="mt-4 rounded-[18px] border border-white/[0.055] bg-black/15 p-4"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-[13px] border border-emerald-400/10 bg-emerald-400/[0.04] text-emerald-300">✓</div><div><p className="text-xs font-medium text-slate-300">Isolasi data organisasi</p><p className="mt-1 text-[10px] leading-5 text-slate-600">Akses admin dibatasi berdasarkan organisasi aktif dan peran yang terdaftar.</p></div></div></div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Feature({ index, title, text }: { index: string; title: string; text: string }) {
  return <div className="group rounded-[18px] border border-white/[0.055] bg-white/[0.02] p-4 transition duration-300 hover:-translate-y-0.5 hover:border-cyan-300/10 hover:bg-cyan-300/[0.025]"><div className="flex items-center justify-between"><span className="font-mono text-[10px] text-cyan-300/50">{index}</span><span className="h-1.5 w-1.5 rounded-full bg-slate-700 transition group-hover:bg-cyan-300" /></div><p className="mt-4 text-sm font-semibold text-slate-200">{title}</p><p className="mt-2 text-[11px] leading-5 text-slate-600">{text}</p></div>;
}
