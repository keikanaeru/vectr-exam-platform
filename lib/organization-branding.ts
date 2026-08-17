import { createAdminClient } from "@/lib/supabase/admin";

export type OrganizationBranding = {
  organizationId: string;
  displayName: string;
  logoUrl: string | null;
  showPoweredBy: boolean;
};

export async function getOrganizationBranding(
  organizationId: string,
  fallbackName = "VECTR Exam Platform"
): Promise<OrganizationBranding> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("organization_branding")
    .select("organization_id, display_name, logo_path, show_powered_by")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error && error.code !== "42P01") {
    console.error("ORGANIZATION BRANDING READ ERROR", error);
  }

  const logoPath = data?.logo_path ? String(data.logo_path) : null;
  const logoUrl = logoPath
    ? supabase.storage.from("exam-branding").getPublicUrl(logoPath).data.publicUrl
    : null;

  return {
    organizationId,
    displayName: data?.display_name ? String(data.display_name) : fallbackName,
    logoUrl,
    showPoweredBy: Boolean(data?.show_powered_by),
  };
}
