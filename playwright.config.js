const { defineConfig, devices } = require("@playwright/test");
require("./tests/helpers/e2e-env");

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const startLocalServer =
  process.env.E2E_NO_WEBSERVER !== "1" &&
  /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(baseURL);

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: process.env.CI ? 1 : 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: startLocalServer
    ? {
        command: process.platform === "win32" ? "npm.cmd run dev" : "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : undefined,
});
