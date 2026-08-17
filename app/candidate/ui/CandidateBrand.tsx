export default function CandidateBrand({
  displayName = "VECTR Exam Platform",
  logoUrl = null,
  subtitle,
  size = "md",
}: {
  displayName?: string;
  logoUrl?: string | null;
  subtitle?: string;
  size?: "sm" | "md" | "lg";
}) {
  const box = size === "lg" ? "h-14 w-14 rounded-[20px]" : size === "sm" ? "h-9 w-9 rounded-xl" : "h-10 w-10 rounded-2xl";

  return (
    <div className="flex items-center gap-3">
      {logoUrl ? (
        <div className={`relative flex ${box} shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-white/5 shadow-lg backdrop-blur-xl`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt={`Logo ${displayName}`} className="h-full w-full object-contain p-1.5" />
        </div>
      ) : null}
      <div className="min-w-0 text-left">
        <p className="truncate font-semibold tracking-tight text-white">{displayName}</p>
        {subtitle ? <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p> : null}
      </div>
    </div>
  );
}
