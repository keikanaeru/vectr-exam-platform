export default function PoweredBy({ show }: { show: boolean }) {
  if (!show) return null;
  return <p className="mt-5 text-center text-[10px] uppercase tracking-[0.18em] text-slate-600">Powered by VECTR Exam Platform</p>;
}
