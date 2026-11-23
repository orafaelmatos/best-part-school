import { defineConfig } from "@playwright/test";

const baseURL = process.env.MOBILE_TEST_BASE_URL || "http://127.0.0.1:8082";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined);

export default defineConfig({
  testDir: "./tests/mobile",
  outputDir: "/tmp/best-part-mobile-playwright",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL,
    browserName: "chromium",
    launchOptions: { executablePath },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev:student -- --host 127.0.0.1 --port 8082 --strictPort",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
