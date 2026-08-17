import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminOrganization } from "@/lib/require-admin-organization";
import { getOrganizationSubscriptionState } from "@/lib/organization-subscription";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function SubscriptionPage() {
  const { organizationId, organization, context } = await requireAdminOrganization();
  const state = await getOrganizationSubscriptionState(createAdminClient(), organizationId);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 sm:px-8">
      <section className="liquid-card p-7 sm:p-9">
        <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-cyan-300/70">Langganan</p>
        <h1 className="mt-3 text-2xl font-semibold text-white">{organization.name}</h1>
        <p className="mt-2 text-sm text-slate-400">
          {context.profile.isPlatformOwner ? "Platform Owner tetap dapat mengelola workspace ini." : "Status akses workspace Anda."}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[16px] border border-white/[0.06] bg-white/[0.025] p-4">
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-600">Akses penuh sampai</p>
            <p className="mt-2 text-sm font-medium text-slate-200">{formatDate(state.accessUntil)} WIB</p>
          </div>
          <div className="rounded-[16px] border border-white/[0.06] bg-white/[0.025] p-4">
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-600">Retensi sampai</p>
            <p className="mt-2 text-sm font-medium text-slate-200">{formatDate(state.retentionUntil)} WIB</p>
          </div>
        </div>
      </section>
    </main>
  );
}
