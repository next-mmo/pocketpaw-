import { test, expect } from "@playwright/test";

test.describe("Projects Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#/projects");
  });

  test("renders page header with logo and action buttons", async ({ page }) => {
    // Logo should be visible
    await expect(page.locator('[class*="panel-header"]').first()).toBeVisible();

    // New Project button
    const newProjectBtn = page.getByRole("link", { name: /New Project/i });
    await expect(newProjectBtn).toBeVisible();

    // Import Project button
    const importBtn = page.getByRole("button", { name: /Import Project/i });
    await expect(importBtn).toBeVisible();
  });

  test("has GitHub link in header", async ({ page }) => {
    // The GitHub icon link uses data-tooltip, find by href instead
    const ghLink = page.locator(
      'a[href="https://github.com/walterlow/freecut"]',
    );
    await expect(ghLink.first()).toBeVisible();
  });

  test("New Project button navigates to new project form", async ({ page }) => {
    const newProjectBtn = page.getByRole("link", { name: /New Project/i });
    await newProjectBtn.click();

    await expect(page).toHaveURL(/#\/projects\/new/);
  });

  test("shows empty state or project list after loading", async ({ page }) => {
    // Wait for loading to finish (spinner disappears)
    await page.waitForFunction(
      () => {
        const spinners = document.querySelectorAll(".animate-spin");
        return spinners.length === 0;
      },
      { timeout: 10_000 },
    );

    // Either shows a project list or empty state - page should not be blank
    const body = page.locator("body");
    await expect(body).not.toBeEmpty();
  });
});
