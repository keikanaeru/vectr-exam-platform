const { test, expect } = require("@playwright/test");
const { loginAdmin } = require("./helpers/login");

test.setTimeout(180_000);

function stamp() {
  return Date.now().toString(36).toUpperCase();
}

async function stableGoto(page, url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForLoadState("domcontentloaded");
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[GOLDEN] navigation retry ${attempt}/3 for ${url}: ${error.message}`);
      await page.waitForTimeout(1200);
    }
  }
  throw lastError;
}

async function chooseGlassSelect(page, form, name, optionText) {
  const hidden = form.locator(`input[type="hidden"][name="${name}"]`).first();
  await expect(hidden).toBeAttached({ timeout: 15_000 });

  const root = hidden.locator("..");
  const trigger = root.getByRole("button").first();
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();

  const option = page
    .getByRole("option")
    .filter({ hasText: optionText })
    .first();

  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
}

test.describe("VECTR Golden Path — admin lifecycle", () => {
  test("module → question → batch → candidate → exam draft", async ({ page, baseURL }) => {
    const target = String(baseURL || process.env.E2E_BASE_URL || "");
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(target)) {
      throw new Error(
        `Golden Path MUTATES data and is blocked outside localhost. Current baseURL=${target}`
      );
    }

    const id = stamp();
    const moduleCode = `AUTO-MOD-${id}`;
    const moduleName = `Golden Module ${id}`;
    const questionCode = `Q-${id}`;
    const batchCode = `AUTO-BATCH-${id}`;
    const batchName = `Golden Batch ${id}`;
    const candidateCode = `AUTO-P-${id}`;
    const candidateName = `Golden Candidate ${id}`;
    const examTitle = `Golden Exam ${id}`;

    await test.step("login admin", async () => {
      await loginAdmin(page);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(500);
      await expect(page).toHaveURL(/\/admin(?:\/|$)/, { timeout: 30_000 });
    });

    await test.step("create module", async () => {
      await stableGoto(page, "/admin/modules");
      await expect(page).toHaveURL(/\/admin\/modules(?:\?|$)/, { timeout: 30_000 });

      const form = page.locator("form").filter({ hasText: "Buat Modul" }).first();
      await expect(form).toBeVisible({ timeout: 30_000 });

      await form.locator('input[name="code"]').fill(moduleCode);
      await form.locator('input[name="name"]').fill(moduleName);
      await form.locator('textarea[name="description"]').fill("Playwright Golden Path");
      await form.locator('input[name="duration"]').fill("15");
      await form.getByRole("button", { name: "Buat Modul", exact: true }).click();

      await expect(page.getByText(moduleCode, { exact: true })).toBeVisible({ timeout: 30_000 });
    });

    await test.step("create active question", async () => {
      const moduleCard = page.locator("article").filter({ hasText: moduleCode }).first();
      await expect(moduleCard).toBeVisible({ timeout: 20_000 });
      await moduleCard.getByRole("link", { name: "Buka Bank Soal", exact: true }).click();

      await expect(page.getByText(moduleCode, { exact: true })).toBeVisible({ timeout: 30_000 });

      const form = page.locator("form").filter({ hasText: "Tambah Soal" }).first();
      await expect(form).toBeVisible();

      await form.locator('input[name="code"]').fill(questionCode);
      await form.locator('textarea[name="question_text"]').fill("2 + 2 = ?");
      await form.locator('input[name="option_a"]').fill("4");
      await form.locator('input[name="option_b"]').fill("3");
      await form.locator('input[name="option_c"]').fill("5");
      await form.locator('input[name="option_d"]').fill("6");
      await form.locator('input[name="weight"]').fill("1");

      await form.getByRole("button", { name: "Simpan Soal", exact: true }).click();
      await expect(page.getByText(questionCode, { exact: true })).toBeVisible({ timeout: 30_000 });
    });

    await test.step("activate module", async () => {
      await stableGoto(page, "/admin/modules");

      const moduleCard = page.locator("article").filter({ hasText: moduleCode }).first();
      await expect(moduleCard).toBeVisible({ timeout: 30_000 });

      const activate = moduleCard.getByRole("button", { name: "Aktifkan Modul", exact: true });
      await expect(activate).toBeVisible();
      await activate.click();

      await expect(
        page.locator("article").filter({ hasText: moduleCode }).first().getByText("AKTIF", { exact: true })
      ).toBeVisible({ timeout: 30_000 });
    });

    await test.step("create batch", async () => {
      await stableGoto(page, "/admin/participants");

      const form = page.locator("form").filter({ hasText: "Buat Batch" }).first();
      await expect(form).toBeVisible({ timeout: 30_000 });

      await form.locator('input[name="code"]').fill(batchCode);
      await form.locator('input[name="name"]').fill(batchName);
      await form.locator('textarea[name="description"]').fill("Playwright Golden Path");
      await form.getByRole("button", { name: "Buat Batch", exact: true }).click();

      await expect(page.getByText(batchCode, { exact: true })).toBeVisible({ timeout: 30_000 });
    });

    await test.step("create candidate", async () => {
      const batchCard = page.locator("article").filter({ hasText: batchCode }).first();
      await expect(batchCard).toBeVisible({ timeout: 30_000 });

      const addDetails = batchCard
        .locator("details")
        .filter({ hasText: "Tambah Peserta Manual" })
        .first();

      await addDetails.locator("summary").click();

      const form = addDetails.locator("form").first();
      await expect(form).toBeVisible();

      await form.locator('input[name="candidate_code"]').fill(candidateCode);
      await form.locator('input[name="display_name"]').fill(candidateName);
      await form.getByRole("button", { name: "Tambah Peserta", exact: true }).click();

      await expect(page.getByText(candidateCode, { exact: true })).toBeVisible({ timeout: 30_000 });
    });

    await test.step("create exam draft", async () => {
      await stableGoto(page, "/admin/exams");

      const form = page.locator("form").filter({ hasText: "Buat Ujian" }).first();
      await expect(form).toBeVisible({ timeout: 30_000 });

      await form.locator('input[name="title"]').fill(examTitle);

      await chooseGlassSelect(page, form, "section_module_id", moduleName);
      await chooseGlassSelect(page, form, "batch_id", batchName);

      await expect(form.locator('input[name="login_open_at"]')).not.toHaveValue("", {
        timeout: 15_000,
      });
      await expect(form.locator('input[name="starts_at"]')).not.toHaveValue("", {
        timeout: 15_000,
      });
      await expect(form.locator('input[name="hard_close_at"]')).not.toHaveValue("", {
        timeout: 15_000,
      });

      await form.getByRole("button", { name: "Buat sebagai Draft", exact: true }).click();

      await expect(page.getByText(examTitle, { exact: true })).toBeVisible({ timeout: 40_000 });
    });

    console.log("");
    console.log("========================================");
    console.log("VECTR GOLDEN PATH V1.1 PASS");
    console.log(`module    : ${moduleCode}`);
    console.log(`question  : ${questionCode}`);
    console.log(`batch     : ${batchCode}`);
    console.log(`candidate : ${candidateCode}`);
    console.log(`exam      : ${examTitle}`);
    console.log("========================================");
  });
});
