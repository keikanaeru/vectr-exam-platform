import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminOrganization } from "@/lib/require-admin-organization";
import { getOrganizationSubscriptionState } from "@/lib/organization-subscription";
import AdminPrimaryHeader from "@/app/admin/ui/AdminPrimaryHeader";

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
      <AdminPrimaryHeader
        eyebrow="Langganan"
        title={organization.name}
        description={context.profile.isPlatformOwner ? "Platform Owner tetap dapat mengelola workspace ini." : "Status akses workspace Anda."}
      />

      <section className="admin-summary-strip admin-subscription-summary mt-5 grid gap-0 sm:grid-cols-2">
        <div className="r9-surface-subtle p-4">
          <p className="r9-kicker">Akses penuh sampai</p>
          <p className="mt-2 text-sm font-medium text-slate-200">{formatDate(state.accessUntil)} WIB</p>
        </div>
        <div className="r9-surface-subtle p-4">
          <p className="r9-kicker">Retensi sampai</p>
          <p className="mt-2 text-sm font-medium text-slate-200">{formatDate(state.retentionUntil)} WIB</p>
        </div>
      </section>
    </main>
  );
}
