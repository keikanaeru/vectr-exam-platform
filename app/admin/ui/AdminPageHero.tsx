import Link from "next/link";
import type { ReactNode } from "react";

export default function AdminPageHero({
  eyebrow,
  title,
  description,
  organizationName,
  status,
  backHref,
  backLabel = "Kembali",
  actions,
  accent = "cyan",
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  organizationName?: string;
  status?: ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  accent?: "cyan" | "blue" | "violet" | "emerald";
}) {
  const glow =
    accent === "violet"
      ? "bg-violet-500/[0.09]"
      : accent === "blue"
        ? "bg-blue-500/[0.09]"
        : accent === "emerald"
          ? "bg-emerald-500/[0.08]"
          : "bg-cyan-500/[0.08]";

  const kicker =
    accent === "violet"
      ? "text-violet-300/65"
      : accent === "blue"
        ? "text-blue-300/65"
        : accent === "emerald"
          ? "text-emerald-300/65"
          : "text-cyan-300/65";

  return (
    <>
      {backHref ? (
        <Link
          href={backHref}
          className="mb-5 inline-flex items-center gap-2 text-xs font-medium text-slate-500 transition hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
        >
          <span aria-hidden="true">←</span>
          <span>{backLabel}</span>
        </Link>
      ) : null}

      <section className="admin-page-hero">
        <div className={`pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full ${glow} blur-3xl`} />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-blue-500/[0.04] blur-3xl" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {organizationName ? (
                <span className="liquid-badge px-3 py-1.5 text-[11px] font-medium text-slate-300">
                  {organizationName}
                </span>
              ) : null}
              {status}
            </div>

            <p className={`mt-5 text-xs font-semibold uppercase tracking-[0.18em] ${kicker}`}>
              {eyebrow}
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {title}
            </h1>

            {description ? (
              <div className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                {description}
              </div>
            ) : null}
          </div>

          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </div>
      </section>
    </>
  );
}
