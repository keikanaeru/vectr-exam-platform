import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";


type AdminOrganization = {
  organizationId: string;
  code: string;
  name: string;
  slug: string;
  role: string;
};


export type AdminContext = {
  userId: string;

  profile: {
    fullName: string;
    globalRole: string;
    isPlatformOwner: boolean;
  };

  organizations: AdminOrganization[];

  activeOrganization:
    AdminOrganization | null;

  organizationId:
    string | null;

  organizationRole:
    string | null;
};


type AdminOrganizationRpcRow = {
  organization_id:
    string | null;

  organization_code:
    string | null;

  organization_name:
    string | null;

  organization_slug:
    string | null;

  organization_role:
    string | null;
};


export async function getAdminContext():
  Promise<AdminContext | null> {

  const supabase =
    await createClient();


  // ================================
  // USER LOGIN
  // ================================

  const {
    data: claimsData,
  } =
    await supabase.auth.getClaims();


  const userId =
    claimsData?.claims?.sub;


  if (!userId) {
    return null;
  }


  // ================================
  // ADMIN PROFILE
  // ================================

  const {
    data: profile,
    error: profileError,
  } =
    await supabase
      .from("admin_profiles")
      .select(
        `
        id,
        full_name,
        role,
        active,
        is_platform_owner
        `
      )
      .eq(
        "id",
        userId
      )
      .maybeSingle();


  if (
    profileError ||
    !profile ||
    !profile.active
  ) {
    return null;
  }


  // ================================
  // ORGANISASI YANG BOLEH DIAKSES
  // ================================

  const {
    data: organizationRows,
    error: organizationError,
  } =
    await supabase.rpc(
      "get_my_admin_organizations"
    );


  if (organizationError) {
    console.error(
      "ADMIN ORGANIZATION ERROR:",
      organizationError
    );

    throw new Error(
      "Gagal membaca organisasi admin."
    );
  }


  // ================================
  // NORMALISASI DATA RPC
  // ================================

  const rows:
    AdminOrganizationRpcRow[] =
    (organizationRows ?? []);


  const mappedOrganizations: AdminOrganization[] =
    rows
      .map((row) => ({
        organizationId: String(row.organization_id ?? ""),
        code: String(row.organization_code ?? ""),
        name: String(row.organization_name ?? ""),
        slug: String(row.organization_slug ?? ""),
        role: String(row.organization_role ?? ""),
      }))
      .filter((organization) => Boolean(organization.organizationId));

  let organizations = mappedOrganizations;

  if (mappedOrganizations.length > 0) {
    const { data: activeOrganizationRows, error: activeOrganizationError } =
      await supabase
        .from("organizations")
        .select("id, active")
        .in(
          "id",
          mappedOrganizations.map((organization) => organization.organizationId)
        )
        .eq("active", true);

    if (activeOrganizationError) {
      console.error("ACTIVE ADMIN ORGANIZATION FILTER ERROR:", activeOrganizationError);
      throw new Error("Gagal memvalidasi status organisasi admin.");
    }

    const activeIds = new Set(
      (activeOrganizationRows ?? []).map((organization) => String(organization.id))
    );

    organizations = mappedOrganizations.filter((organization) =>
      activeIds.has(organization.organizationId)
    );
  }


  // ================================
  // COOKIE ORGANISASI AKTIF
  // ================================

  const cookieStore =
    await cookies();


  const requestedOrganizationId =
    cookieStore.get(
      "admin_organization_id"
    )?.value;


  // Cookie tidak langsung dipercaya.
  // Harus cocok dengan organisasi
  // yang memang boleh diakses user.

  let activeOrganization:
    AdminOrganization | null =
    organizations.find(
      (organization) =>
        organization.organizationId ===
        requestedOrganizationId
    ) ?? null;


  // Kalau belum memilih organisasi,
  // gunakan organisasi pertama.

  if (
    !activeOrganization &&
    organizations.length > 0
  ) {
    activeOrganization =
      organizations[0];
  }


  // ================================
  // RETURN
  // ================================

  return {
    userId,

    profile: {
      fullName:
        String(
          profile.full_name ??
          "Admin"
        ),

      globalRole:
        String(
          profile.role ??
          ""
        ),

      isPlatformOwner:
        Boolean(
          profile.is_platform_owner
        ),
    },

    organizations,

    activeOrganization,

    organizationId:
      activeOrganization
        ?.organizationId ??
      null,

    organizationRole:
      activeOrganization
        ?.role ??
      null,
  };
}