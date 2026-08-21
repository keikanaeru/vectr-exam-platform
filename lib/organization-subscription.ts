import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminOrganization } from "@/lib/require-admin-organization";

type SubscriptionAccessMode =
  | "FULL"
  | "EXPORT_ONLY"
  | "SUSPENDED"
  | "PURGE_DUE"
  | "MISSING";

export type OrganizationSubscriptionState = {
  organizationId: string;
  mode: SubscriptionAccessMode;
  planCode: string;
  accessStartedAt: string | null;
  accessUntil: string | null;
  retentionUntil: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  canWrite: boolean;
  canExport: boolean;
  canCandidateStart: boolean;
  daysUntilExpiry: number | null;
  daysUntilRetentionEnds: number | null;
};

type SubscriptionRow = {
  organization_id: string;
  plan_code: string | null;
  access_started_at: string | null;
  access_until: string | null;
  retention_until: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
};

function daysUntil(value: string | null, nowMs: number) {
  if (!value) return null;
  const target = new Date(value).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.ceil((target - nowMs) / 86_400_000);
}

export function deriveOrganizationSubscriptionState(
  row: SubscriptionRow | null,
  now = new Date()
): OrganizationSubscriptionState {
  const nowMs = now.getTime();
  const organizationId = String(row?.organization_id ?? "");

  if (!row) {
    return {
      organizationId,
      mode: "MISSING",
      planCode: "MONTHLY_FULL",
      accessStartedAt: null,
      accessUntil: null,
      retentionUntil: null,
      suspendedAt: null,
      suspensionReason: null,
      canWrite: false,
      canExport: false,
      canCandidateStart: false,
      daysUntilExpiry: null,
      daysUntilRetentionEnds: null,
    };
  }

  const accessUntilMs = row.access_until ? new Date(row.access_until).getTime() : Number.NaN;
  const retentionUntilMs = row.retention_until ? new Date(row.retention_until).getTime() : Number.NaN;

  let mode: SubscriptionAccessMode;
  if (row.suspended_at) {
    mode = "SUSPENDED";
  } else if (!Number.isFinite(accessUntilMs) || !Number.isFinite(retentionUntilMs)) {
    mode = "MISSING";
  } else if (nowMs < accessUntilMs) {
    mode = "FULL";
  } else if (nowMs < retentionUntilMs) {
    mode = "EXPORT_ONLY";
  } else {
    mode = "PURGE_DUE";
  }

  return {
    organizationId,
    mode,
    planCode: String(row.plan_code ?? "MONTHLY_FULL"),
    accessStartedAt: row.access_started_at,
    accessUntil: row.access_until,
    retentionUntil: row.retention_until,
    suspendedAt: row.suspended_at,
    suspensionReason: row.suspension_reason,
    canWrite: mode === "FULL",
    canExport: mode === "FULL" || mode === "EXPORT_ONLY",
    canCandidateStart: mode === "FULL",
    daysUntilExpiry: daysUntil(row.access_until, nowMs),
    daysUntilRetentionEnds: daysUntil(row.retention_until, nowMs),
  };
}

export async function getOrganizationSubscriptionState(
  supabase: ReturnType<typeof createAdminClient>,
  organizationId: string,
  now = new Date()
): Promise<OrganizationSubscriptionState> {
  const { data, error } = await supabase
    .from("organization_subscriptions")
    .select(
      "organization_id, plan_code, access_started_at, access_until, retention_until, suspended_at, suspension_reason"
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    // Treat an unavailable subscription contract as a recoverable MISSING state.
    // The Platform page / db-health preflight surfaces the database issue without
    // triggering Next.js' development error overlay on every admin page.
    const missing = deriveOrganizationSubscriptionState(null, now);
    return { ...missing, organizationId };
  }

  const state = deriveOrganizationSubscriptionState((data as SubscriptionRow | null) ?? null, now);
  return { ...state, organizationId };
}

export async function getOrganizationSubscriptionStates(
  supabase: ReturnType<typeof createAdminClient>,
  organizationIds: string[],
  now = new Date()
) {
  const ids = [...new Set(organizationIds.filter(Boolean))];
  const result = new Map<string, OrganizationSubscriptionState>();
  if (!ids.length) return result;

  const { data, error } = await supabase
    .from("organization_subscriptions")
    .select(
      "organization_id, plan_code, access_started_at, access_until, retention_until, suspended_at, suspension_reason"
    )
    .in("organization_id", ids);

  if (error) {
    for (const id of ids) {
      const missing = deriveOrganizationSubscriptionState(null, now);
      result.set(id, { ...missing, organizationId: id });
    }
    return result;
  }

  const rowMap = new Map(
    ((data ?? []) as SubscriptionRow[]).map((row) => [String(row.organization_id), row])
  );

  for (const id of ids) {
    const state = deriveOrganizationSubscriptionState(rowMap.get(id) ?? null, now);
    result.set(id, { ...state, organizationId: id });
  }

  return result;
}


export function ensureScheduleWithinSubscription(
  state: OrganizationSubscriptionState,
  scheduledAt: string | Date | number,
  label = "Jadwal"
) {
  if (state.mode !== "FULL" || !state.accessUntil) return;

  const targetMs = scheduledAt instanceof Date
    ? scheduledAt.getTime()
    : typeof scheduledAt === "number"
      ? scheduledAt
      : new Date(scheduledAt).getTime();
  const accessUntilMs = new Date(state.accessUntil).getTime();

  if (!Number.isFinite(targetMs) || !Number.isFinite(accessUntilMs)) return;
  if (targetMs <= accessUntilMs) return;

  const accessLabel = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(accessUntilMs));

  throw new Error(
    `${label} melewati masa aktif langganan (${accessLabel} WIB). Perpanjang langganan atau majukan jadwal.`
  );
}

function subscriptionWriteBlockedMessage(state: OrganizationSubscriptionState) {
  if (state.mode === "EXPORT_ONLY") {
    return "Masa aktif langganan sudah berakhir. Workspace sekarang hanya-baca; data tetap dapat dilihat dan diekspor sampai masa retensi berakhir.";
  }
  if (state.mode === "SUSPENDED") {
    return state.suspensionReason
      ? `Langganan sedang ditangguhkan: ${state.suspensionReason}`
      : "Langganan sedang ditangguhkan oleh pengelola platform.";
  }
  if (state.mode === "PURGE_DUE") {
    return "Masa retensi data sudah berakhir. Akses workspace dikunci; hubungi pengelola platform untuk pemulihan atau penghapusan permanen.";
  }
  return "Status langganan belum siap. Hubungi pengelola platform sebelum mengubah data.";
}

export async function requireAdminReadAccess() {
  const adminContext = await requireAdminOrganization();
  const subscription = await getOrganizationSubscriptionState(
    createAdminClient(),
    adminContext.organizationId
  );

  if (
    !adminContext.context.profile.isPlatformOwner &&
    !["FULL", "EXPORT_ONLY"].includes(subscription.mode)
  ) {
    redirect(`/admin/subscription?error=${encodeURIComponent(subscriptionWriteBlockedMessage(subscription))}`);
  }

  return { ...adminContext, subscription };
}

export async function requireAdminWriteAccess() {
  const adminContext = await requireAdminOrganization();
  const subscription = await getOrganizationSubscriptionState(
    createAdminClient(),
    adminContext.organizationId
  );

  if (!adminContext.context.profile.isPlatformOwner && !subscription.canWrite) {
    redirect(`/admin?error=${encodeURIComponent(subscriptionWriteBlockedMessage(subscription))}`);
  }

  return { ...adminContext, subscription };
}

export async function requireAdminExportAccess() {
  const adminContext = await requireAdminOrganization();
  const subscription = await getOrganizationSubscriptionState(
    createAdminClient(),
    adminContext.organizationId
  );

  if (!adminContext.context.profile.isPlatformOwner && !subscription.canExport) {
    redirect(`/admin?error=${encodeURIComponent(subscriptionWriteBlockedMessage(subscription))}`);
  }

  return { ...adminContext, subscription };
}
