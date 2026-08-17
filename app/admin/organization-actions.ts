"use server";

import {
  cookies,
} from "next/headers";

import {
  redirect,
} from "next/navigation";

import {
  getAdminContext,
} from "@/lib/admin-context";


export async function setActiveOrganization(
  formData: FormData
) {
  const organizationId =
    String(
      formData.get(
        "organization_id"
      ) || ""
    ).trim();


  const requestedReturnTo =
    String(
      formData.get(
        "return_to"
      ) || "/admin"
    ).trim();


  const returnTo =
    requestedReturnTo.startsWith("/admin") &&
    !requestedReturnTo.startsWith("//")
      ? requestedReturnTo
      : "/admin";


  if (!organizationId) {
    throw new Error(
      "Organisasi tidak valid."
    );
  }


  const context =
    await getAdminContext();


  if (!context) {
    redirect("/login");
  }


  // =====================================
  // SECURITY CHECK
  // =====================================
  //
  // Jangan percaya organization_id
  // yang dikirim browser.
  //
  // Pastikan user memang punya akses.
  // =====================================

  const allowed =
    context.organizations.some(
      (organization) =>
        organization.organizationId ===
        organizationId
    );


  if (!allowed) {
    throw new Error(
      "Anda tidak memiliki akses ke organisasi ini."
    );
  }


  // =====================================
  // SIMPAN PILIHAN ORGANISASI
  // =====================================

  const cookieStore =
    await cookies();


  cookieStore.set(
    "admin_organization_id",
    organizationId,
    {
      httpOnly: true,

      secure:
        process.env.NODE_ENV ===
        "production",

      sameSite:
        "lax",

      path:
        "/admin",

      maxAge:
        60 * 60 * 24 * 30,
    }
  );


  redirect(returnTo);
}