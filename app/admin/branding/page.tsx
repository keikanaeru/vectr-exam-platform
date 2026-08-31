import { requireAdminReadAccess } from "@/lib/organization-subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import FlashNotice from "@/app/ui/FlashNotice";
import Link from "next/link";
import AdminPrimaryHeader from "@/app/admin/ui/AdminPrimaryHeader";
import BrandLogoField from "./BrandLogoField";

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
      <AdminPrimaryHeader
        eyebrow="Identitas Tampilan"
        title="Branding Peserta"
        description="Logo dan nama di Tautan Peserta, portal kandidat, ruang ujian, dan halaman hasil. Branding tidak mengubah data ujian."
      />

      {params.error ? <FlashNotice tone="error" message={params.error} /> : null}
      {params.success ? <FlashNotice tone="success" message={params.success} /> : null}

      <section className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <form action={saveOrganizationBranding} className="r9-surface p-6 sm:p-7">
          <h2 className="text-xl font-semibold text-white">Identitas tampilan</h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">Gunakan logo yang tetap terbaca pada latar terang maupun gelap.</p>

          <label className="mt-6 block">
            <span className="r9-field-label mb-2">Nama Tampilan</span>
            <input name="display_name" maxLength={120} defaultValue={data?.display_name ? String(data.display_name) : organization.name} className="r9-input" />
          </label>

          <BrandLogoField />

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

          <button className="r9-button r9-button--primary mt-6">Simpan Branding</button>
        </form>

        <aside className="admin-brand-preview-panel r9-surface h-fit p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="admin-brand-preview-kicker">Pratinjau</p>
              <h2 className="mt-1 text-base font-semibold text-white">
                Portal Peserta
              </h2>
            </div>

            <span className="admin-brand-preview-badge">
              PREVIEW
            </span>
          </div>

          <div className="admin-brand-preview-canvas mt-5">
            <div
              className="admin-brand-preview-browser"
              aria-hidden="true"
            >
              <span />
              <span />
              <span />
            </div>

            <div className="admin-brand-preview-content">
              {logoUrl ? (
                <div className="admin-brand-preview-logo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoUrl}
                    alt="Pratinjau logo"
                    className="h-full w-full object-contain p-2.5"
                  />
                </div>
              ) : (
                <div className="admin-brand-preview-placeholder">
                  <span
                    className="admin-brand-preview-placeholder-mark"
                    aria-hidden="true"
                  >
                    V
                  </span>

                  <div>
                    <p>Logo belum dipasang</p>
                    <span>
                      Area logo tidak ditampilkan ke peserta
                    </span>
                  </div>
                </div>
              )}

              <p className="admin-brand-preview-name">
                {data?.display_name
                  ? String(data.display_name)
                  : organization.name}
              </p>

              <p className="admin-brand-preview-label">
                Portal Peserta
              </p>

              <Link
                href="/candidate/login"
                target="_blank"
                rel="noreferrer"
                className="admin-brand-preview-action"
              >
                Buka Portal Peserta ↗
              </Link>

              {data?.show_powered_by ? (
                <p className="admin-brand-preview-powered">
                  Powered by VECTR Exam Platform
                </p>
              ) : null}
            </div>
          </div>

          <p className="mt-4 text-[11px] leading-5 text-slate-500">
            Buka Portal Peserta untuk melihat halaman login sebenarnya.
            Perubahan pada form ini baru tampil di portal setelah Branding disimpan.
          </p>
        </aside>
      </section>
    </main>
  );
}
