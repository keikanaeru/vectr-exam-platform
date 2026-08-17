export default function AdminLoading() {
  return (
    <main className="admin-route-loading mx-auto max-w-7xl px-6 py-10 sm:px-8" aria-live="polite" aria-busy="true">
      <section className="liquid-card overflow-hidden p-6 sm:p-8">
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <span className="admin-loading-dot h-2.5 w-2.5 rounded-full" />
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Memuat halaman</p>
          </div>
          <div className="mt-6 h-8 w-52 rounded-xl bg-white/[0.06]" />
          <div className="mt-3 h-3 w-full max-w-xl rounded-full bg-white/[0.04]" />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="admin-loading-block h-28 rounded-[20px] border border-white/[0.06] bg-white/[0.025]" />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
