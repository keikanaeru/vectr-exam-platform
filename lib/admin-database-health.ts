import "server-only";

import { unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

export type AdminDatabaseHealth = {
  version?: string;
  ok?: boolean;
  missing?: unknown;
} | null;

async function readAdminDatabaseHealth(): Promise<AdminDatabaseHealth> {
  const healthResult = await createAdminClient().rpc(
    "exam_platform_healthcheck"
  );

  if (
    healthResult.error ||
    !healthResult.data ||
    typeof healthResult.data !== "object"
  ) {
    return null;
  }

  return healthResult.data as {
    version?: string;
    ok?: boolean;
    missing?: unknown;
  };
}

export const getCachedAdminDatabaseHealth = unstable_cache(
  readAdminDatabaseHealth,
  ["vectr-admin-database-health-v1"],
  {
    revalidate: 60,
  }
);
