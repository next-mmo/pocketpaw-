import { test, expect } from "@playwright/test";

test.describe("Settings Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#/settings");
  });

  test("renders settings page title and all sections", async ({ page }) => {
    // Page title
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    // All sections should be present
    await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Export Defaults" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Keyboard Shortcuts" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
  });

  test("General section shows auto-save interval control", async ({ page }) => {
    await expect(page.getByText("Auto-save Interval")).toBeVisible();
  });

  test("Timeline section shows all toggle switches", async ({ page }) => {
    // Default FPS
    await expect(page.getByText("Default FPS")).toBeVisible();

    // Toggle labels
    await expect(page.getByText("Snap to Grid")).toBeVisible();
    await expect(page.getByText("Show Waveforms")).toBeVisible();
    await expect(page.getByText("Show Filmstrips")).toBeVisible();
  });

  test("Export section shows format and quality selectors", async ({
    page,
  }) => {
    await expect(page.getByText("Default Format")).toBeVisible();
    await expect(page.getByText("Default Quality")).toBeVisible();
  });

  test("Keyboard Shortcuts section displays shortcut list", async ({
    page,
  }) => {
    // Should show at least some common shortcuts
    await expect(page.getByText("Play/Pause")).toBeVisible();
    await expect(page.getByText(/Undo/i)).toBeVisible();
    await expect(page.getByText(/Redo/i)).toBeVisible();
  });

  test("About section shows GitHub link", async ({ page }) => {
    const aboutLink = page.getByRole("link", { name: /View on GitHub/i });
    await expect(aboutLink).toBeVisible();
    await expect(aboutLink).toHaveAttribute(
      "href",
      "https://github.com/walterlow/freecut",
    );
  });

  test("Reset to Defaults button is visible", async ({ page }) => {
    const resetBtn = page.getByRole("button", { name: /Reset to Defaults/i });
    await expect(resetBtn).toBeVisible();
  });

  test("back button navigates to projects page", async ({ page }) => {
    // The back button is an ArrowLeft icon in a button wrapped by a Link
    const backBtn = page
      .locator('a[href*="projects"] button, a[href*="projects"]')
      .first();
    await backBtn.click();

    await expect(page).toHaveURL(/#\/projects/);
  });
});
