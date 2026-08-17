import { requireAdminReadAccess } from "@/lib/organization-subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import FlashNotice from "@/app/ui/FlashNotice";

import { saveOrganizationBranding } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { error?: string; success?: string };

export default async function BrandingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { organizationId, organization } = await requireAdminReadAccess();
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("organization_branding")
    .select("display_name, logo_path, show_powered_by")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const logoPath = data?.logo_path ? String(data.logo_path) : null;
  const logoUrl = logoPath ? supabase.storage.from("exam-branding").getPublicUrl(logoPath).data.publicUrl : null;

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-8">
      <section className="admin-page-hero relative overflow-hidden rounded-[28px] border border-white/[0.07] bg-white/[0.025] p-7 sm:p-9">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative">
          <span className="liquid-badge px-3 py-1.5 text-xs text-cyan-200">Branding Organisasi</span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">Branding Peserta</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Logo dan nama di Tautan Peserta, portal kandidat, ruang ujian, dan halaman hasil. Branding tidak mengubah data ujian.
          </p>
        </div>
      </section>

      {params.error ? <FlashNotice tone="error" message={params.error} /> : null}
      {params.success ? <FlashNotice tone="success" message={params.success} /> : null}

      <section className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <form action={saveOrganizationBranding} className="liquid-card p-6 sm:p-7">
          <h2 className="text-xl font-semibold text-white">Identitas tampilan</h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">Gunakan logo yang tetap terbaca pada latar terang maupun gelap.</p>

          <label className="mt-6 block">
            <span className="mb-2 block text-xs text-slate-400">Nama Tampilan</span>
            <input name="display_name" maxLength={120} defaultValue={data?.display_name ? String(data.display_name) : organization.name} className="field" />
          </label>

          <label className="mt-5 block">
            <span className="mb-2 block text-xs text-slate-400">Logo Organisasi</span>
            <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="field file:mr-3 file:rounded-lg file:border-0 file:bg-white/[0.07] file:px-3 file:py-2 file:text-xs file:text-slate-200" />
            <span className="mt-2 block text-[11px] leading-5 text-slate-600">PNG/JPG/WEBP · maksimal 512 KB.</span>
          </label>

          {logoPath ? (
            <label className="mt-4 flex items-center gap-3 rounded-[15px] border border-white/[0.06] bg-white/[0.02] p-4 text-xs text-slate-400">
              <input type="checkbox" name="remove_logo" className="h-4 w-4 accent-rose-500" />
              Hapus logo saat menyimpan
            </label>
          ) : null}

          <label className="mt-4 flex items-start gap-3 rounded-[15px] border border-white/[0.06] bg-white/[0.02] p-4">
            <input type="checkbox" name="show_powered_by" defaultChecked={Boolean(data?.show_powered_by)} className="mt-0.5 h-4 w-4 accent-cyan-500" />
            <span>
              <span className="block text-xs font-medium text-slate-300">Tampilkan “Powered by VECTR Exam Platform”</span>
              <span className="mt-1 block text-[11px] leading-5 text-slate-600">Opsional untuk menampilkan identitas teknis platform. Ini terpisah dari sponsor kegiatan atau perlombaan.</span>
            </span>
          </label>

          <button className="liquid-button-primary mt-6 rounded-[14px] px-5 py-3 text-sm font-semibold">Simpan Branding</button>
        </form>

        <aside className="liquid-card h-fit p-6">
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-600">Pratinjau</p>
          <div className="mt-4 rounded-[22px] border border-white/[0.07] bg-slate-950/55 p-6 text-center">
            {logoUrl ? (
              <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.05]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="Pratinjau logo" className="h-full w-full object-contain p-2" />
              </div>
            ) : (
              <div className="mx-auto max-w-[220px] rounded-[16px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-3 text-[11px] text-slate-600">
                Belum ada logo · area logo tidak ditampilkan ke peserta
              </div>
            )}
            <p className="mt-5 text-lg font-semibold text-white">{data?.display_name ? String(data.display_name) : organization.name}</p>
            <p className="mt-1 text-xs text-slate-500">Portal Peserta</p>
            {data?.show_powered_by ? <p className="mt-5 text-[10px] uppercase tracking-[0.18em] text-slate-600">Powered by VECTR Exam Platform</p> : null}
          </div>
        </aside>
      </section>
    </main>
  );
}

