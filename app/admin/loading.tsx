export default function AdminLoading() {
  return (
    <main className="r9-route-loading mx-auto max-w-7xl px-6 py-8 sm:px-8" aria-live="polite" aria-busy="true">
      <section className="r9-surface r9-loading-surface">
        <div className="r9-loading-label">
          <span className="r9-loading-signal" aria-hidden="true" />
          <span>Memuat halaman</span>
        </div>
        <div className="r9-loading-title" />
        <div className="r9-loading-copy" />
        <div className="r9-loading-grid">
          {[0, 1, 2].map((item) => (
            <div key={item} className="r9-loading-block" />
          ))}
        </div>
      </section>
    </main>
  );
}
