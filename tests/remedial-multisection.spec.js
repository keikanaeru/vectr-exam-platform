const { test, expect } = require("@playwright/test");
const { requiredEnv } = require("./helpers/e2e-env");

test.describe("R9 remedial multi-section candidate flow", () => {
  test("candidate can complete section A, transition, and enter section B", async ({ page, baseURL }) => {
    const target = String(baseURL || process.env.E2E_BASE_URL || "");
    const env = requiredEnv(
      "E2E_MULTI_EXAM_ID",
      "E2E_MULTI_CANDIDATE_CODE",
      "E2E_MULTI_CANDIDATE_ACCESS_CODE"
    );

    test.skip(!env.ok, `Missing: ${env.missing.join(", ")}`);
    test.skip(
      process.env.E2E_ALLOW_EXAM_MUTATION !== "1",
      "Use a dedicated local multi-section remedial exam and set E2E_ALLOW_EXAM_MUTATION=1."
    );
    test.skip(
      !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(target),
      `Mutation test is blocked outside localhost. baseURL=${target}`
    );

    const examId = process.env.E2E_MULTI_EXAM_ID;
    await page.goto(`/join/${examId}`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Kode Peserta").fill(process.env.E2E_MULTI_CANDIDATE_CODE);
    await page.getByLabel("Kode Akses Ujian").fill(process.env.E2E_MULTI_CANDIDATE_ACCESS_CODE);
    await page.getByRole("button", { name: /Masuk ke Ujian/i }).click();
    await expect(page).toHaveURL(new RegExp(`/candidate(?:/exam/${examId})?(?:\?.*)?$`), {
      timeout: 30_000,
    });
    await page.goto(`/candidate/exam/${examId}`);

    const acknowledgement = page.locator('input[name="policy_acknowledged"]');
    if (await acknowledgement.isVisible().catch(() => false)) {
      await acknowledgement.check();
    }

    const start = page.getByRole("button", { name: /Mulai \/ Lanjutkan Ujian/i });
    await expect(start).toBeVisible({ timeout: 20_000 });
    await start.click();
    await expect(page).toHaveURL(new RegExp(`/candidate/exam/${examId}/take`), {
      timeout: 40_000,
    });

    const firstAnswer = page.locator("button.candidate-answer-option").first();
    if (await firstAnswer.isVisible().catch(() => false)) {
      await firstAnswer.click();
      await expect(page.getByText("Jawaban tersimpan", { exact: true })).toBeVisible({
        timeout: 20_000,
      });
    }

    await page.getByRole("button", { name: /Selesaikan sesi/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole("button", { name: /Selesaikan sesi/i }).click();

    await expect(page.getByText("Sesi sebelumnya selesai", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    const next = page.getByRole("button", { name: /Saya Siap · Mulai/i });
    await expect(next).toBeVisible({ timeout: 20_000 });
    await next.click();
    await expect(page).toHaveURL(new RegExp(`/candidate/exam/${examId}/take`), {
      timeout: 30_000,
    });
    await expect(page.getByText(/SESI 2\//i)).toBeVisible({ timeout: 20_000 });
  });
});
