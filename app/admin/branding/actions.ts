"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminWriteAccess } from "@/lib/organization-subscription";
import { databaseErrorMessage } from "@/lib/db-error";

const MAX_LOGO_BYTES = 512 * 1024;
const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function success(message: string): never {
  redirect(`/admin/branding?success=${encodeURIComponent(message)}`);
}

function fail(message: string): never {
  redirect(`/admin/branding?error=${encodeURIComponent(message)}`);
}

export async function saveOrganizationBranding(formData: FormData) {
  const { organizationId, organization } = await requireAdminWriteAccess();
  const supabase = createAdminClient();

  const displayName = String(formData.get("display_name") ?? "").trim() || organization.name;
  const showPoweredBy = formData.get("show_powered_by") === "on";
  const removeLogo = formData.get("remove_logo") === "on";
  const logo = formData.get("logo");

  if (displayName.length > 120) fail("Nama tampilan maksimal 120 karakter.");

  const { data: existing, error: existingError } = await supabase
    .from("organization_branding")
    .select("logo_path")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (existingError && existingError.code !== "PGRST116") {
    console.error("READ BRANDING ERROR", existingError);
  }

  let logoPath = existing?.logo_path ? String(existing.logo_path) : null;

  if (removeLogo && logoPath) {
    const { error } = await supabase.storage.from("exam-branding").remove([logoPath]);
    if (error) console.error("REMOVE BRAND LOGO ERROR", error);
    logoPath = null;
  }

  if (logo instanceof File && logo.size > 0) {
    const ext = MIME_EXT[logo.type];
    if (!ext) fail("Logo harus PNG, JPG, atau WEBP.");
    if (logo.size > MAX_LOGO_BYTES) fail("Ukuran logo maksimal 512 KB.");

    const path = `organizations/${organizationId}/logo.${ext}`;
    const bytes = new Uint8Array(await logo.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("exam-branding")
      .upload(path, bytes, {
        contentType: logo.type,
        upsert: true,
        cacheControl: "3600",
      });

    if (uploadError) {
      console.error("BRANDING LOGO UPLOAD ERROR", uploadError);
      fail(`Logo gagal diunggah: ${uploadError.message}`);
    }

    if (logoPath && logoPath !== path) {
      await supabase.storage.from("exam-branding").remove([logoPath]);
    }
    logoPath = path;
  }

  const { error } = await supabase.from("organization_branding").upsert(
    {
      organization_id: organizationId,
      display_name: displayName,
      logo_path: logoPath,
      show_powered_by: showPoweredBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" }
  );

  if (error) {
    fail(databaseErrorMessage("ORGANIZATION_BRANDING", "Branding organisasi gagal disimpan.", error));
  }

  revalidatePath("/admin");
  revalidatePath("/admin/branding");
  revalidatePath("/candidate");
  success("Branding organisasi berhasil disimpan.");
}
