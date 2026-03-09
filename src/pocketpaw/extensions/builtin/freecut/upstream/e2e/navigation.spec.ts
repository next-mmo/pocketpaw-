import { test, expect } from "@playwright/test";

test.describe("Navigation & Routing", () => {
  test("landing page → projects via Get Started", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Get Started/i }).click();
    await expect(page).toHaveURL(/#\/projects/);
  });

  test("landing page → projects via Start Editing (CTA footer)", async ({
    page,
  }) => {
    await page.goto("/");
    // Scroll to CTA footer
    const startEditingBtn = page.getByRole("link", { name: /Start Editing/i });
    await startEditingBtn.scrollIntoViewIfNeeded();
    await startEditingBtn.click();
    await expect(page).toHaveURL(/#\/projects/);
  });

  test("projects → new project → cancel → back to projects", async ({
    page,
  }) => {
    await page.goto("/#/projects");

    // Navigate to new project
    await page.getByRole("link", { name: /New Project/i }).click();
    await expect(page).toHaveURL(/#\/projects\/new/);

    // Cancel back
    await page.getByRole("button", { name: /Cancel/i }).click();
    await expect(page).toHaveURL(/#\/projects/);
  });

  test("full flow: landing → projects → new → create → editor", async ({
    page,
  }) => {
    // Landing
    await page.goto("/");
    await page.getByRole("link", { name: /Get Started/i }).click();
    await expect(page).toHaveURL(/#\/projects/);

    // New project
    await page.getByRole("link", { name: /New Project/i }).click();
    await expect(page).toHaveURL(/#\/projects\/new/);

    // Fill form and create
    await page.getByLabel(/Project Name/i).fill("Full Flow E2E Test");
    const createBtn = page.getByRole("button", { name: /Create Project/i });
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    // Should land in editor
    await expect(page).toHaveURL(/#\/editor\//, { timeout: 15_000 });
  });

  test("direct navigation to settings via URL", async ({ page }) => {
    await page.goto("/#/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  test("hash routing preserves route on page reload", async ({ page }) => {
    await page.goto("/#/projects");
    await expect(page).toHaveURL(/#\/projects/);

    // Reload the page
    await page.reload();

    // Should still be on projects page after reload
    await expect(page).toHaveURL(/#\/projects/);
    // Wait for content to load
    const newProjectBtn = page.getByRole("link", { name: /New Project/i });
    await expect(newProjectBtn).toBeVisible({ timeout: 10_000 });
  });
});
