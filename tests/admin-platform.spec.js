const { test, expect } = require("@playwright/test");
const { requiredEnv } = require("./helpers/e2e-env");
const { loginAdmin } = require("./helpers/login");

test.describe("Admin safe smoke", () => {
  test.beforeEach(() => {
    const env = requiredEnv("E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD");
    test.skip(!env.ok, `Missing: ${env.missing.join(", ")}`);
  });

  test("admin can login and open dashboard", async ({ page }) => {
    await loginAdmin(page);
    await expect(page.locator("body")).toContainText(/Dashboard|Modul|Peserta|Ujian/i);
  });

  test("platform owner console renders", async ({ page }) => {
    test.skip(process.env.E2E_PLATFORM_OWNER !== "1", "Set E2E_PLATFORM_OWNER=1 for a Platform Owner account.");

    await loginAdmin(page);
    await page.goto("/admin/platform");

    await expect(page).toHaveURL(/\/admin\/platform/);
    await expect(page.getByText("Buat Pelanggan Baru")).toBeVisible();
    await expect(page.getByRole("button", { name: /Buat Pelanggan & Kirim Undangan/i })).toBeVisible();
  });
});
