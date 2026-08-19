const { test, expect } = require("@playwright/test");
const { requiredEnv } = require("./helpers/e2e-env");
const { loginCandidateForExam } = require("./helpers/login");

test.describe("Candidate mutating exam smoke", () => {
  test.beforeEach(() => {
    const env = requiredEnv(
      "E2E_CANDIDATE_CODE",
      "E2E_CANDIDATE_ACCESS_CODE",
      "E2E_EXAM_ID"
    );

    test.skip(!env.ok, `Missing: ${env.missing.join(", ")}`);
    test.skip(
      process.env.E2E_ALLOW_EXAM_MUTATION !== "1",
      "Set E2E_ALLOW_EXAM_MUTATION=1 and use a dedicated dummy exam/candidate."
    );
  });

  test("candidate can enter exact exam and reach take page", async ({ page }) => {
    const examId = process.env.E2E_EXAM_ID;

    await loginCandidateForExam(page, examId);
    await page.goto(`/candidate/exam/${examId}`);

    await expect(page).toHaveURL(new RegExp(`/candidate/exam/${examId}`), {
      timeout: 15_000,
    });

    const acknowledgement = page.locator('input[name="policy_acknowledged"]');
    if (await acknowledgement.isVisible().catch(() => false)) {
      await acknowledgement.check();
    }

    const start = page.getByRole("button", { name: /Mulai \/ Lanjutkan Ujian/i });
    await expect(start).toBeVisible({ timeout: 15_000 });
    await expect(start).toBeEnabled({ timeout: 15_000 });
    await start.click();

    await expect(page).toHaveURL(new RegExp(`/candidate/exam/${examId}/take`), {
      timeout: 30_000,
    });

    // Re-check R8.2 identity after the take page accepts the device.
    const cookies = await page.context().cookies();
    expect(cookies.some((cookie) => cookie.name === "candidate_session")).toBeTruthy();
    expect(cookies.some((cookie) => cookie.name === "candidate_device")).toBeTruthy();

    // Keep this smoke test non-destructive after session creation:
    // no final submit and no arbitrary answer locator guessing.
    await expect(page.locator("body")).toContainText(
      /Tandai|Ditandai|Berikutnya|Selesaikan|Soal/i
    );
  });
});
