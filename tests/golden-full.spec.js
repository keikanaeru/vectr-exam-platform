const { test, expect } = require("@playwright/test");
const ExcelJS = require("exceljs");
const { loginAdmin } = require("./helpers/login");

test.setTimeout(300_000);

function stamp() {
  return Date.now().toString(36).toUpperCase();
}

function wibValue(deltaMinutes) {
  const date = new Date(Date.now() + deltaMinutes * 60_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

async function stableGoto(page, url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(1000);
    }
  }
  throw lastError;
}

async function chooseGlassSelect(page, form, name, optionText) {
  const hidden = form.locator(`input[type="hidden"][name="${name}"]`).first();
  await expect(hidden).toBeAttached({ timeout: 15_000 });
  const trigger = hidden.locator("..").getByRole("button").first();
  await trigger.click();
  const option = page.getByRole("option").filter({ hasText: optionText }).first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
}

async function setHiddenValue(locator, value) {
  await locator.evaluate((element, nextValue) => {
    element.value = nextValue;
  }, value);
}

async function confirmAdminAction(page) {
  const dialog = page.getByRole("dialog", { name: "Konfirmasi tindakan" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole("button", { name: "Ya, lanjutkan" }).click();
}

async function loginExactExam(page, examId, candidateCode, accessCode) {
  await stableGoto(page, `/join/${examId}`);
  await page.getByLabel("Kode Peserta").fill(candidateCode);
  await page.getByLabel("Kode Akses Ujian").fill(accessCode);
  await page.getByRole("button", { name: /Masuk ke Ujian/i }).click();
  await expect(page).toHaveURL(new RegExp(`/candidate/exam/${examId}(?:$|\\?)`), {
    timeout: 30_000,
  });
}

async function startExam(page, examId) {
  const ack = page.locator('input[name="policy_acknowledged"]');
  if (await ack.isVisible().catch(() => false)) {
    await ack.check();
  }
  const start = page.getByRole("button", { name: /Mulai \/ Lanjutkan Ujian/i });
  await expect(start).toBeVisible({ timeout: 20_000 });
  await expect(start).toBeEnabled({ timeout: 20_000 });
  await start.click();
  await expect(page).toHaveURL(new RegExp(`/candidate/exam/${examId}/take`), {
    timeout: 40_000,
  });
}

test.describe("VECTR Golden Full V2", () => {
  test("admin build → activate → credential → candidate → device lock → autosave → submit → result", async ({ page, browser, baseURL }) => {
    const target = String(baseURL || process.env.E2E_BASE_URL || "");
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(target)) {
      throw new Error(`Golden Full MUTATES data and is blocked outside localhost. baseURL=${target}`);
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

    await test.step("1 admin login", async () => {
      await loginAdmin(page);
      await expect(page).toHaveURL(/\/admin(?:\/|$)/, { timeout: 30_000 });
    });

    await test.step("2 create module", async () => {
      await stableGoto(page, "/admin/modules");
      const form = page.locator("form").filter({ hasText: "Buat Modul" }).first();
      await expect(form).toBeVisible({ timeout: 30_000 });
      await form.locator('input[name="code"]').fill(moduleCode);
      await form.locator('input[name="name"]').fill(moduleName);
      await form.locator('textarea[name="description"]').fill("Golden Full V2");
      await form.locator('input[name="duration"]').fill("15");
      await form.getByRole("button", { name: "Buat Modul", exact: true }).click();
      await expect(page.getByText(moduleCode, { exact: true })).toBeVisible({ timeout: 30_000 });
    });

    await test.step("3 create active question", async () => {
      const moduleCard = page.locator("article").filter({ hasText: moduleCode }).first();
      await moduleCard.getByRole("link", { name: "Buka Bank Soal", exact: true }).click();
      const form = page.locator("form").filter({ hasText: "Tambah Soal" }).first();
      await expect(form).toBeVisible({ timeout: 30_000 });
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

    await test.step("4 activate module", async () => {
      await stableGoto(page, "/admin/modules");
      const card = page.locator("article").filter({ hasText: moduleCode }).first();
      await card.getByRole("button", { name: "Aktifkan Modul", exact: true }).click();
      await expect(page.locator("article").filter({ hasText: moduleCode }).first().getByText("AKTIF", { exact: true }))
        .toBeVisible({ timeout: 30_000 });
    });

    await test.step("5 create batch + candidate", async () => {
      await stableGoto(page, "/admin/participants");
      const batchForm = page.locator("form").filter({ hasText: "Buat Batch" }).first();
      await batchForm.locator('input[name="code"]').fill(batchCode);
      await batchForm.locator('input[name="name"]').fill(batchName);
      await batchForm.locator('textarea[name="description"]').fill("Golden Full V2");
      await batchForm.getByRole("button", { name: "Buat Batch", exact: true }).click();
      await expect(page.getByText(batchCode, { exact: true })).toBeVisible({ timeout: 30_000 });

      const batchCard = page.locator("article").filter({ hasText: batchCode }).first();
      const details = batchCard.locator("details").filter({ hasText: "Tambah Peserta Manual" }).first();
      await details.locator("summary").click();
      const form = details.locator("form").first();
      await form.locator('input[name="candidate_code"]').fill(candidateCode);
      await form.locator('input[name="display_name"]').fill(candidateName);
      await form.getByRole("button", { name: "Tambah Peserta", exact: true }).click();
      await expect(page.getByText(candidateCode, { exact: true })).toBeVisible({ timeout: 30_000 });
    });

    let examId = "";

    await test.step("6 create immediately runnable exam", async () => {
      await stableGoto(page, "/admin/exams");
      const form = page.locator("form").filter({ hasText: "Buat Ujian" }).first();
      await expect(form).toBeVisible({ timeout: 30_000 });
      await form.locator('input[name="title"]').fill(examTitle);
      await chooseGlassSelect(page, form, "section_module_id", moduleName);
      await chooseGlassSelect(page, form, "batch_id", batchName);

      // Override the future UI defaults immediately before submit:
      // login already open, exam already started, hard close safely in future.
      await setHiddenValue(form.locator('input[name="login_open_at"]'), wibValue(-3));
      await setHiddenValue(form.locator('input[name="starts_at"]'), wibValue(-1));
      await setHiddenValue(form.locator('input[name="hard_close_at"]'), wibValue(45));

      await form.getByRole("button", { name: "Buat sebagai Draft", exact: true }).click();
      await expect(page.getByText(examTitle, { exact: true })).toBeVisible({ timeout: 40_000 });

      const card = page.locator("article").filter({ hasText: examTitle }).first();
      const settingsHref = await card.locator('a[href*="/settings"]').first().getAttribute("href");
      const match = settingsHref && settingsHref.match(/\/admin\/exams\/([^/]+)\/settings/);
      if (!match) throw new Error("Golden Full: gagal mengambil examId dari kartu ujian.");
      examId = match[1];
    });

    await test.step("7 activate exam + generate credential", async () => {
      let card = page.locator("article").filter({ hasText: examTitle }).first();
      await expect(card.getByText("SIAP", { exact: true })).toBeVisible({ timeout: 30_000 });
      await card.getByRole("button", { name: "Aktifkan Ujian", exact: true }).click();
      await confirmAdminAction(page);

      card = page.locator("article").filter({ hasText: examTitle }).first();
      await expect(card.getByText("AKTIF", { exact: true })).toBeVisible({ timeout: 40_000 });

      const credentialButton = card.getByRole("button", { name: /Buat \/ Perbaiki Credential/i });
      if (await credentialButton.isVisible().catch(() => false)) {
        await credentialButton.click();
      }

      card = page.locator("article").filter({ hasText: examTitle }).first();
      await expect(card.getByText(/1\/1 READY/)).toBeVisible({ timeout: 60_000 });
    });

    let accessCode = "";

    await test.step("8 fetch and read generated credential", async () => {
      // Do NOT depend on the browser "download" event. In headed/dev mode the
      // route can return the XLSX correctly while Chromium handles the response
      // without emitting Playwright's download event quickly enough.
      //
      // BrowserContext.request shares the same authenticated cookies, so this
      // exercises the real credential export route directly and deterministically.
      const credentialUrl = new URL(
        `/admin/exams/${examId}/credentials/xlsx`,
        target
      ).toString();

      const response = await page.context().request.get(credentialUrl, {
        timeout: 60_000,
      });

      if (!response.ok()) {
        throw new Error(
          `Golden Full: credential XLSX route gagal HTTP ${response.status()} - ${await response.text()}`
        );
      }

      const contentType = String(response.headers()["content-type"] || "");
      if (!contentType.includes("spreadsheetml")) {
        throw new Error(
          `Golden Full: credential route bukan XLSX. content-type=${contentType}`
        );
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await response.body());

      const sheet = workbook.getWorksheet("Credential");
      if (!sheet) throw new Error("Golden Full: sheet Credential tidak ditemukan.");

      for (let rowNumber = 8; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        const code = String(row.getCell(4).value ?? "").trim();
        if (code === candidateCode) {
          accessCode = String(row.getCell(5).value ?? "").trim();
          break;
        }
      }

      if (!accessCode) {
        throw new Error(`Golden Full: credential ${candidateCode} tidak ditemukan.`);
      }
    });

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const candidateA = await contextA.newPage();
    const candidateB = await contextB.newPage();

    try {
      await test.step("9 candidate A login + start", async () => {
        await loginExactExam(candidateA, examId, candidateCode, accessCode);
        await startExam(candidateA, examId);
      });

      await test.step("10 device B rejected", async () => {
        await loginExactExam(candidateB, examId, candidateCode, accessCode);

        const ack = candidateB.locator('input[name="policy_acknowledged"]');
        if (await ack.isVisible().catch(() => false)) await ack.check();

        const start = candidateB.getByRole("button", { name: /Mulai \/ Lanjutkan Ujian/i });
        await expect(start).toBeVisible({ timeout: 20_000 });
        await start.click();

        await expect(candidateB.locator("body")).toContainText(
          /perangkat lain|Credential sedang aktif|device lock/i,
          { timeout: 30_000 }
        );
        await expect(candidateB).not.toHaveURL(new RegExp(`/candidate/exam/${examId}/take$`));
      });

      await test.step("11 answer + autosave + flag + refresh", async () => {
        const optionFour = candidateA
          .locator('button[type="button"]')
          .filter({ hasText: "4" })
          .first();

        await expect(optionFour).toBeVisible({ timeout: 20_000 });
        await optionFour.click();
        await expect(candidateA.getByText("Jawaban tersimpan", { exact: true }))
          .toBeVisible({ timeout: 20_000 });

        const flag = candidateA.getByRole("button", { name: /Tandai Soal/i });
        await flag.click();
        await expect(candidateA.getByRole("button", { name: /Ditandai/i }))
          .toBeVisible({ timeout: 20_000 });

        await candidateA.reload({ waitUntil: "domcontentloaded" });
        await expect(candidateA.getByText("1/1", { exact: true }).first())
          .toBeVisible({ timeout: 30_000 });
        await expect(candidateA.getByRole("button", { name: /Ditandai/i }))
          .toBeVisible({ timeout: 20_000 });
      });

      await test.step("12 submit + result", async () => {
        await candidateA.getByRole("button", { name: "Selesaikan Ujian", exact: true }).click();

        const dialog = candidateA.getByRole("dialog");
        await expect(dialog).toBeVisible({ timeout: 10_000 });
        await dialog.getByRole("button", { name: "Ya, Kirim Ujian", exact: true }).click();

        await expect(candidateA).toHaveURL(new RegExp(`/candidate/exam/${examId}/result`), {
          timeout: 60_000,
        });
        await expect(candidateA.locator("body")).not.toContainText(/Finalisasi ujian gagal|Submit gagal/i);
      });
    } finally {
      await contextA.close();
      await contextB.close();
    }

    console.log("");
    console.log("==================================================");
    console.log("VECTR GOLDEN FULL V2 PASS");
    console.log(`module     : ${moduleCode}`);
    console.log(`question   : ${questionCode}`);
    console.log(`batch      : ${batchCode}`);
    console.log(`candidate  : ${candidateCode}`);
    console.log(`exam       : ${examTitle}`);
    console.log(`examId     : ${examId}`);
    console.log("deviceLock : PASS");
    console.log("autosave   : PASS");
    console.log("submit     : PASS");
    console.log("result     : PASS");
    console.log("==================================================");
  });
});
