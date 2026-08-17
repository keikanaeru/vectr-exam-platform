import AppIcon from "@/app/ui/AppIcon";
import VectrBrand from "@/app/ui/VectrBrand";
import { confirmAccountLink } from "./actions";

type Params = { token_hash?: string; type?: string; next?: string };

export const dynamic = "force-dynamic";

export default async function ActivateAccountPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const type = params.type === "invite" || params.type === "magiclink" || params.type === "recovery" ? params.type : null;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const next = typeof params.next === "string" ? params.next : (type === "invite" ? "/update-password?mode=invite" : "/update-password?mode=recovery");
  const valid = Boolean(type && tokenHash);
  const invite = type === "invite" || type === "magiclink" || next.includes("mode=invite");

  return (
    <main className="candidate-surface relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12 text-white">
      <div className="pointer-events-none absolute -left-40 top-1/4 h-96 w-96 rounded-full bg-blue-500/[0.08] blur-[130px]" />
      <div className="pointer-events-none absolute -right-40 top-1/3 h-96 w-96 rounded-full bg-violet-500/[0.08] blur-[130px]" />
      <div className="relative w-full max-w-md text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-[20px] border border-cyan-400/15 bg-cyan-400/[0.06] text-cyan-100"><AppIcon name="key" className="h-7 w-7" /></div>
        <VectrBrand centered className="mx-auto mt-5 w-fit" subtitle="Exam Platform" />
        <h1 className="mt-2 text-3xl font-bold">{invite ? "Aktivasi Akun Admin" : "Reset Password"}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">{valid ? "Konfirmasi tindakan ini untuk melanjutkan. Langkah tambahan ini mencegah link email dipakai otomatis oleh pemindai keamanan inbox." : "Tautan tidak lengkap atau tidak valid."}</p>
        <div className="liquid-card mt-6 p-6 text-left">
          {valid && type ? (
            <form action={confirmAccountLink.bind(null, tokenHash, type, next)}>
              <div className="rounded-[15px] border border-cyan-400/10 bg-cyan-400/[0.03] px-4 py-4">
                <p className="text-xs font-semibold text-slate-200">{invite ? "Email Anda akan diverifikasi" : "Sesi reset password akan dibuka"}</p>
                <p className="mt-1.5 text-[11px] leading-5 text-slate-600">Setelah konfirmasi, Anda akan diminta membuat password pribadi. Link hanya dapat digunakan sesuai masa berlaku token Supabase.</p>
              </div>
              <button className="liquid-button-primary mt-5 w-full rounded-[14px] px-4 py-3.5 text-sm font-semibold">{invite ? "Aktifkan Akun" : "Lanjutkan Reset Password"}</button>
            </form>
          ) : (
            <a href="/login" className="liquid-button flex w-full justify-center rounded-[14px] px-4 py-3.5 text-sm font-semibold">Kembali ke Login</a>
          )}
        </div>
      </div>
    </main>
  );
}
