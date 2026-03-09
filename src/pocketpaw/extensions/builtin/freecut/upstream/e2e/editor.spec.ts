import { test, expect } from "@playwright/test";

/**
 * Editor tests - first create a project, then verify the editor loads correctly.
 * Each test navigates through the new project flow to get a valid projectId.
 */
test.describe("Editor", () => {
  /**
   * Helper: create a project and navigate to the editor.
   * Returns the page already on the editor route.
   */
  async function createProjectAndOpenEditor(
    page: import("@playwright/test").Page,
    projectName: string,
  ) {
    await page.goto("/#/projects/new");

    const nameInput = page.getByLabel(/Project Name/i);
    await nameInput.fill(projectName);

    const createBtn = page.getByRole("button", { name: /Create Project/i });
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    // Wait for editor to load
    await expect(page).toHaveURL(/#\/editor\//, { timeout: 15_000 });
    // Wait for editor container to render
    await page.waitForSelector(".h-screen", { timeout: 10_000 });
  }

  test("editor loads with toolbar after project creation", async ({ page }) => {
    await createProjectAndOpenEditor(page, "Editor Load Test");

    // The editor should have a full-height layout
    const editorContainer = page.locator(".h-screen");
    await expect(editorContainer).toBeVisible();
  });

  test("editor shows project name in toolbar", async ({ page }) => {
    const projectName = "Named Project Test";
    await createProjectAndOpenEditor(page, projectName);

    // The toolbar should display the project name
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
  });

  test("editor has resizable panels", async ({ page }) => {
    await createProjectAndOpenEditor(page, "Panels Test");

    // Should have resizable panel groups
    const panelGroup = page.locator("[data-panel-group-id]");
    await expect(panelGroup.first()).toBeVisible({ timeout: 10_000 });
  });

  test("editor has a preview area", async ({ page }) => {
    await createProjectAndOpenEditor(page, "Preview Area Test");

    // Look for canvas or video preview area
    const previewArea = page
      .locator('canvas, video, [class*="preview"]')
      .first();
    await expect(previewArea).toBeVisible({ timeout: 15_000 });
  });

  test("navigating to invalid project shows error", async ({ page }) => {
    await page.goto("/#/editor/nonexistent-project-id-12345");

    // Should show an error message (ErrorBoundary or route error)
    await expect(
      page.getByText(/not found|error|something went wrong/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
