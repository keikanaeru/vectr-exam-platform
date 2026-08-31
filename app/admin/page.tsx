import {
  Button,
  MetricStrip,
  PageHeader,
  Status,
  Surface,
} from "@/app/admin/r9/ui";
import { requireAdminReadAccess } from "@/lib/organization-subscription";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { organizationId, organization } = await requireAdminReadAccess();
  const supabase = createAdminClient();

  const [moduleResult, participantResult, examResult] = await Promise.all([
    supabase.from("modules").select("*", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("candidates").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).eq("active", true),
    supabase.from("exams").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "ACTIVE"),
  ]);

  if (moduleResult.error || participantResult.error || examResult.error) {
    throw new Error("Gagal membaca overview operasional.");
  }

  const moduleCount = moduleResult.count ?? 0;
  const participantCount = participantResult.count ?? 0;
  const examCount = examResult.count ?? 0;
  const contentReady = moduleCount > 0;
  const peopleReady = participantCount > 0;
  const workspaceReady = contentReady && peopleReady;

  return (
    <main className="r9-overview mx-auto max-w-7xl px-6 py-8 sm:px-8">
      <PageHeader
        context={organization.name}
        title="Overview"
        description="Kondisi operasional workspace dan langkah berikutnya untuk menyiapkan pelaksanaan ujian."
        actions={
          <Button href="/admin/exams" variant="primary">
            Kelola ujian
          </Button>
        }
      />

      <MetricStrip
        className="r9-overview__metrics"
        items={[
          {
            label: "Bank soal",
            value: moduleCount,
            detail: contentReady ? "Modul tersedia" : "Belum ada modul",
            tone: contentReady ? "accent" : "neutral",
          },
          {
            label: "Peserta aktif",
            value: participantCount,
            detail: peopleReady ? "Siap dialokasikan" : "Belum ada peserta",
            tone: peopleReady ? "accent" : "neutral",
          },
          {
            label: "Ujian aktif",
            value: examCount,
            detail: examCount > 0 ? "Perlu pemantauan" : "Tidak ada sesi live",
            tone: examCount > 0 ? "success" : "neutral",
          },
        ]}
      />

      <div className="r9-overview__grid">
        <Surface className="r9-overview-panel r9-overview-priority">
          <div className="r9-overview__section-head">
            <div>
              <p className="r9-overview__section-label">Prioritas sekarang</p>
              <h2 className="r9-overview__section-title">
                {examCount > 0
                  ? `${examCount} ujian sedang aktif`
                  : workspaceReady
                    ? "Workspace siap menyusun ujian"
                    : "Fondasi ujian belum lengkap"}
              </h2>
            </div>
            <Status tone={examCount > 0 ? "success" : workspaceReady ? "accent" : "warning"}>
              {examCount > 0 ? "Live" : workspaceReady ? "Siap disusun" : "Perlu persiapan"}
            </Status>
          </div>

          <p className="r9-overview-priority__copy">
            {examCount > 0
              ? "Pantau pelaksanaan yang berjalan dan pastikan peserta dapat menyelesaikan sesi tanpa hambatan."
              : workspaceReady
                ? "Bank soal dan peserta sudah tersedia. Lanjutkan ke Ujian untuk menyusun pelaksanaan berikutnya."
                : "Lengkapi bank soal dan peserta sebelum mengatur jadwal serta distribusi ujian."}
          </p>

          <div className="r9-overview-priority__action">
            <Button href={examCount > 0 ? "/admin/exams" : contentReady ? "/admin/participants" : "/admin/modules"}>
              {examCount > 0 ? "Buka pusat ujian" : contentReady ? "Siapkan peserta" : "Buat bank soal"}
            </Button>
          </div>
        </Surface>

        <Surface className="r9-overview-panel">
          <div className="r9-overview__section-head">
            <div>
              <p className="r9-overview__section-label">Kesiapan workspace</p>
              <h2 className="r9-overview__section-title">Fondasi pelaksanaan</h2>
            </div>
            <Status tone={workspaceReady ? "success" : "warning"}>
              {workspaceReady ? "Siap" : "Belum lengkap"}
            </Status>
          </div>

          <div className="r9-overview-readiness">
            <div className="r9-overview-readiness__item">
              <div>
                <strong>Bank soal</strong>
                <span>{contentReady ? `${moduleCount} modul tersedia` : "Buat modul dan isi soal"}</span>
              </div>
              <Status tone={contentReady ? "success" : "warning"}>
                {contentReady ? "Tersedia" : "Belum siap"}
              </Status>
            </div>
            <div className="r9-overview-readiness__item">
              <div>
                <strong>Peserta</strong>
                <span>{peopleReady ? `${participantCount} peserta aktif` : "Import atau tambah peserta"}</span>
              </div>
              <Status tone={peopleReady ? "success" : "warning"}>
                {peopleReady ? "Tersedia" : "Belum siap"}
              </Status>
            </div>
          </div>
        </Surface>
      </div>

      <Surface className="r9-overview-panel r9-overview-flow">
        <div className="r9-overview__section-head">
          <div>
            <p className="r9-overview__section-label">Alur operasi</p>
            <h2 className="r9-overview__section-title">Dari persiapan sampai hasil</h2>
          </div>
        </div>

        <ol className="r9-lifecycle" aria-label="Tahapan pengelolaan ujian">
          {[
            ["PLAN", "Rencanakan", "/admin/exams"],
            ["CONTENT", "Siapkan soal", "/admin/modules"],
            ["PEOPLE", "Kelola peserta", "/admin/participants"],
            ["DELIVERY", "Distribusikan", "/admin/exams"],
            ["LIVE", "Pantau", "/admin/exams"],
            ["RESULTS", "Tinjau hasil", "/admin/exams"],
          ].map(([code, label, href], index) => (
            <li key={code} className="r9-lifecycle__item">
              <span className="r9-lifecycle__index">{String(index + 1).padStart(2, "0")}</span>
              <span className="r9-lifecycle__copy">
                <strong>{code}</strong>
                <span>{label}</span>
              </span>
              <Button href={href} variant="quiet" className="r9-lifecycle__link">
                Buka
              </Button>
            </li>
          ))}
        </ol>
      </Surface>
    </main>
  );
}
