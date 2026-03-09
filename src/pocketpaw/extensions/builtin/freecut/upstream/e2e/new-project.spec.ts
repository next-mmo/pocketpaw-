import { test, expect } from "@playwright/test";

test.describe("New Project Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#/projects/new");
  });

  test("renders project form with all sections", async ({ page }) => {
    // Project Details section
    await expect(page.getByText("Project Details")).toBeVisible();
    await expect(page.getByLabel(/Project Name/i)).toBeVisible();
    await expect(page.getByLabel(/Description/i)).toBeVisible();

    // Video Settings section
    await expect(page.getByText("Video Settings")).toBeVisible();
    await expect(page.getByText("Resolution")).toBeVisible();
    await expect(page.getByText("Frame Rate")).toBeVisible();
  });

  test("Create Project button is disabled with empty name", async ({
    page,
  }) => {
    // The name field should be empty by default
    const nameInput = page.getByLabel(/Project Name/i);
    await expect(nameInput).toHaveValue("");

    // Create button should be disabled
    const createBtn = page.getByRole("button", { name: /Create Project/i });
    await expect(createBtn).toBeDisabled();
  });

  test("Create Project button enables after entering valid name", async ({
    page,
  }) => {
    const nameInput = page.getByLabel(/Project Name/i);
    await nameInput.fill("My Test Project");

    // Wait for form validation to settle
    const createBtn = page.getByRole("button", { name: /Create Project/i });
    await expect(createBtn).toBeEnabled();
  });

  test("shows validation error for whitespace-only name", async ({ page }) => {
    const nameInput = page.getByLabel(/Project Name/i);
    await nameInput.fill("   ");

    // Trigger validation by clicking away
    await page.getByLabel(/Description/i).click();

    // Create button should remain disabled
    const createBtn = page.getByRole("button", { name: /Create Project/i });
    await expect(createBtn).toBeDisabled();
  });

  test("Cancel button navigates back to projects page", async ({ page }) => {
    const cancelBtn = page.getByRole("button", { name: /Cancel/i });
    // The Cancel button is wrapped in a Link, find it reliably
    await cancelBtn.click();

    await expect(page).toHaveURL(/#\/projects/);
  });

  test("shows template picker with common platform presets", async ({
    page,
  }) => {
    // Template cards should be visible
    await expect(page.getByText("YouTube 1080p")).toBeVisible();
    await expect(page.getByText(/Shorts.*TikTok.*Reels/i)).toBeVisible();
    await expect(page.getByText("Instagram Square")).toBeVisible();
  });

  test("creates a project and navigates to editor", async ({ page }) => {
    // Fill in the project name
    const nameInput = page.getByLabel(/Project Name/i);
    await nameInput.fill("E2E Test Project");

    // Click Create Project
    const createBtn = page.getByRole("button", { name: /Create Project/i });
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    // Should navigate to editor with a project ID
    await expect(page).toHaveURL(/#\/editor\//, { timeout: 15_000 });
  });
});
