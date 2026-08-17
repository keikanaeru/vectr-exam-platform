import Image from "next/image";

export default function VectrBrand({
  compact = false,
  centered = false,
  subtitle = "Exam Platform",
  className = "",
}: {
  compact?: boolean;
  centered?: boolean;
  subtitle?: string;
  className?: string;
}) {
  const markSize = compact ? 36 : 48;

  return (
    <div className={`${centered ? "justify-center text-center" : "text-left"} flex items-center gap-3 ${className}`.trim()}>
      <div
        className={`${compact ? "h-10 w-10 rounded-[14px]" : "h-13 w-13 rounded-[18px]"} flex shrink-0 items-center justify-center border border-cyan-300/15 bg-white/[0.92] shadow-[0_12px_35px_rgba(0,0,0,.2)]`}
      >
        <Image src="/vectr-mark.png" alt="VECTR" width={markSize} height={markSize} className="h-[78%] w-[78%] object-contain" priority />
      </div>
      <div className="min-w-0">
        <p className={`${compact ? "text-sm" : "text-base"} font-bold tracking-[0.12em] text-white`}>VECTR</p>
        <p className={`${compact ? "text-[9px]" : "text-[10px]"} mt-0.5 uppercase tracking-[0.16em] text-cyan-200/55`}>{subtitle}</p>
      </div>
    </div>
  );
}
