/**
 * Playwright config for PocketPaw Electron E2E tests.
 *
 * This project uses Playwright's Electron support (_electron.launch()).
 * Tests MUST import { test, expect } from './fixtures' which provides
 * the `electronApp` and `window` fixtures — never open a standalone browser.
 *
 * @see https://playwright.dev/docs/api/class-electron
 * @see tests/smoke/fixtures.ts
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },

  /* Electron tests must run serially — only one app instance at a time */
  workers: 3,
  // fullyParallel: false,

  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,

  reporter: [["list"], ["html", { open: "never" }]],

  outputDir: "test-results",

  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  /*
   * No "projects" block — we intentionally skip browser projects.
   * Electron launches its own Chromium via _electron.launch() in fixtures.ts.
   * No baseURL is needed; the renderer loads from the built Electron app.
   */
});
