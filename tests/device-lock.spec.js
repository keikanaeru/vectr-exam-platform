const { test, expect } = require("@playwright/test");
const { requiredEnv } = require("./helpers/e2e-env");
const { loginCandidateForExam } = require("./helpers/login");

async function enterTake(page, examId) {
  await loginCandidateForExam(page, examId);
  await page.goto(`/candidate/exam/${examId}`);

  const acknowledgement = page.locator('input[name="policy_acknowledged"]');
  if (await acknowledgement.isVisible().catch(() => false)) {
    await acknowledgement.check();
  }

  const start = page.getByRole("button", { name: /Mulai \/ Lanjutkan Ujian/i });
  await expect(start).toBeVisible({ timeout: 15_000 });
  await expect(start).toBeEnabled({ timeout: 15_000 });
  await start.click();
}

test.describe("R8.2 single-device enforcement", () => {
  test("second browser is rejected while first device owns the exam lease", async ({ browser }) => {
    const env = requiredEnv(
      "E2E_CANDIDATE_CODE",
      "E2E_CANDIDATE_ACCESS_CODE",
      "E2E_EXAM_ID"
    );

    test.skip(!env.ok, `Missing: ${env.missing.join(", ")}`);
    test.skip(
      process.env.E2E_ALLOW_EXAM_MUTATION !== "1",
      "Use a dedicated dummy candidate/exam and set E2E_ALLOW_EXAM_MUTATION=1."
    );

    const examId = process.env.E2E_EXAM_ID;
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await enterTake(pageA, examId);
      await expect(pageA).toHaveURL(new RegExp(`/candidate/exam/${examId}/take`), {
        timeout: 30_000,
      });

      await loginCandidateForExam(pageB, examId);
      await pageB.goto(`/candidate/exam/${examId}`);

      const acknowledgementB = pageB.locator('input[name="policy_acknowledged"]');
      if (await acknowledgementB.isVisible().catch(() => false)) {
        await acknowledgementB.check();
      }

      const startB = pageB.getByRole("button", { name: /Mulai \/ Lanjutkan Ujian/i });
      await expect(startB).toBeVisible({ timeout: 15_000 });
      await expect(startB).toBeEnabled({ timeout: 15_000 });
      await startB.click();

      // R8.2 may reject either on the exam page via error query or during take-page lease check.
      await expect(pageB.locator("body")).toContainText(
        /perangkat lain|Credential sedang aktif|device lock/i,
        { timeout: 20_000 }
      );
      await expect(pageB).not.toHaveURL(new RegExp(`/candidate/exam/${examId}/take$`));
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
