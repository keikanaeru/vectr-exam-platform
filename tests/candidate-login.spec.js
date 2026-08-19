const { test, expect } = require("@playwright/test");
const { requiredEnv } = require("./helpers/e2e-env");
const { loginCandidate } = require("./helpers/login");

test.describe("Candidate safe smoke", () => {
  test.beforeEach(() => {
    const env = requiredEnv("E2E_CANDIDATE_CODE", "E2E_CANDIDATE_ACCESS_CODE");
    test.skip(!env.ok, `Missing: ${env.missing.join(", ")}`);
  });

  test("candidate can login and see exam dashboard", async ({ page }) => {
    await loginCandidate(page);
    await expect(page.locator("body")).toContainText(new RegExp(process.env.E2E_CANDIDATE_CODE, "i"));
    await expect(page.locator("body")).toContainText(/Mulai|Lanjutkan|Ujian|Jadwal/i);
  });
});
