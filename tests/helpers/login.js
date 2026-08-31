const { expect } = require("@playwright/test");

async function waitForAdminLoginHydration(page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  const emailInput = page.getByLabel("Email");
  const passwordInput = page.getByLabel("Password");
  const submitButton = page.getByRole("button", { name: "Masuk", exact: true });

  await expect(emailInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
  await expect(submitButton).toBeVisible();
  await page.waitForTimeout(900);

  return { emailInput, passwordInput, submitButton };
}

async function readAdminLoginError(page) {
  const knownMessages = [
    "Email atau password tidak sesuai.",
    "Email akun belum dikonfirmasi.",
    "Terlalu banyak percobaan login. Tunggu sebentar lalu coba lagi.",
    "Login gagal. Periksa email dan password lalu coba lagi.",
  ];

  for (const message of knownMessages) {
    const locator = page.getByText(message, { exact: true });
    if (await locator.isVisible().catch(() => false)) return message;
  }
  return null;
}

async function loginAdmin(page) {
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { emailInput, passwordInput, submitButton } =
      await waitForAdminLoginHydration(page);

    await emailInput.fill(process.env.E2E_ADMIN_EMAIL);
    await passwordInput.fill(process.env.E2E_ADMIN_PASSWORD);

    const authResponsePromise = page
      .waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/auth/v1/token"),
        { timeout: 12_000 }
      )
      .catch(() => null);

    await submitButton.click();
    const authResponse = await authResponsePromise;

    if (authResponse) {
      const loginError = await readAdminLoginError(page);
      if (loginError) throw new Error(`Admin login ditolak aplikasi: ${loginError}`);
    }

    try {
      await expect(page).toHaveURL(/\/admin(?:\/|$)/, { timeout: 15_000 });
      return;
    } catch (error) {
      const loginError = await readAdminLoginError(page);
      if (loginError) throw new Error(`Admin login ditolak aplikasi: ${loginError}`);
      if (attempt === maxAttempts) throw error;
      await page.waitForTimeout(600);
    }
  }
}

async function loginCandidate(page) {
  await page.goto("/candidate/login");
  await page.getByLabel("Kode Peserta").fill(process.env.E2E_CANDIDATE_CODE);
  await page.getByLabel("Kode Akses").fill(process.env.E2E_CANDIDATE_ACCESS_CODE);
  await page.getByRole("button", { name: /Masuk ke Ujian/i }).click();
  await expect(page).toHaveURL(/\/candidate\/?(?:\?.*)?(?:#.*)?$/, { timeout: 30_000 });
}

async function loginCandidateForExam(page, examId) {
  await page.goto(`/join/${examId}`, { waitUntil: "domcontentloaded" });

  await expect(page.getByLabel("Kode Peserta")).toBeVisible();
  await expect(page.getByLabel("Kode Akses Ujian")).toBeVisible();

  await page.getByLabel("Kode Peserta").fill(process.env.E2E_CANDIDATE_CODE);
  await page.getByLabel("Kode Akses Ujian").fill(process.env.E2E_CANDIDATE_ACCESS_CODE);
  await page.getByRole("button", { name: /Masuk ke Ujian/i }).click();

  // Exact-exam links intentionally redirect straight to the exam preparation
  // page instead of the global candidate dashboard.
  await expect(page).toHaveURL(
    new RegExp(`/candidate(?:/exam/${examId})?(?:\\?.*)?(?:#.*)?$`),
    { timeout: 30_000 }
  );

  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((cookie) => cookie.name === "candidate_session");
  const deviceCookie = cookies.find((cookie) => cookie.name === "candidate_device");

  if (!sessionCookie) {
    throw new Error("E2E diagnosis: candidate_session cookie tidak dibuat setelah login exact-exam.");
  }

  if (!deviceCookie) {
    throw new Error(
      "E2E diagnosis: candidate_device cookie tidak dibuat. R8.2 take page akan mengarahkan kembali ke /candidate/login."
    );
  }

  return {
    sessionCookie,
    deviceCookie,
  };
}

module.exports = {
  loginAdmin,
  loginCandidate,
  loginCandidateForExam,
};
