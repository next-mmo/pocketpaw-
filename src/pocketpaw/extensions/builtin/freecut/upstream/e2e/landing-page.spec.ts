import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders hero section with title and CTA", async ({ page }) => {
    // Main headline
    await expect(page.locator("h1")).toContainText("Edit videos.");
    await expect(page.locator("h1")).toContainText("In your browser.");

    // Sub-text
    await expect(
      page.getByText("Professional video editing, zero installation."),
    ).toBeVisible();

    // Beta badge (exact match to avoid matching disclaimer text containing 'beta')
    await expect(page.getByText("Beta", { exact: true })).toBeVisible();
  });

  test("has Get Started button that navigates to projects", async ({
    page,
  }) => {
    const getStartedBtn = page.getByRole("link", { name: /Get Started/i });
    await expect(getStartedBtn).toBeVisible();
    await getStartedBtn.click();

    // Should navigate to projects page (hash routing)
    await expect(page).toHaveURL(/#\/projects/);
  });

  test("has Star on GitHub link pointing to the repo", async ({ page }) => {
    const githubLinks = page.getByRole("link", { name: /Star on GitHub/i });
    // There are two Star on GitHub links (hero + CTA footer)
    await expect(githubLinks.first()).toHaveAttribute(
      "href",
      "https://github.com/walterlow/freecut",
    );
    await expect(githubLinks.first()).toHaveAttribute("target", "_blank");
  });

  test("displays showcase bento grid with feature cards", async ({ page }) => {
    // Showcase section
    await expect(
      page.getByText("Multi featured editing capabilities"),
    ).toBeVisible();

    // Feature cards
    await expect(page.getByText("Timeline Editing")).toBeVisible();
    await expect(page.getByText("Simple KeyFrame Editor")).toBeVisible();
    await expect(page.getByText("Project Management")).toBeVisible();
    await expect(page.getByText("Export on the Web")).toBeVisible();
  });

  test("displays demo video section with YouTube embed", async ({ page }) => {
    await expect(page.getByText("See it in Action")).toBeVisible();

    const iframe = page.locator('iframe[title="FreeCut Demo"]');
    await expect(iframe).toBeVisible();
    await expect(iframe).toHaveAttribute("src", /youtube\.com\/embed/);
  });

  test("displays FAQ section and accordion items expand", async ({ page }) => {
    await expect(page.getByText("Frequently Asked Questions")).toBeVisible();

    // Click first FAQ item
    const firstQuestion = page.getByText("Is FreeCut really free?");
    await expect(firstQuestion).toBeVisible();
    await firstQuestion.click();

    // Answer should become visible
    await expect(
      page.getByText(
        "Yes, FreeCut is completely free and open source under the MIT license.",
      ),
    ).toBeVisible();
  });

  test("displays CTA footer with Start Editing button", async ({ page }) => {
    await expect(page.getByText("Ready to start editing?")).toBeVisible();

    const startEditingBtn = page.getByRole("link", { name: /Start Editing/i });
    await expect(startEditingBtn).toBeVisible();
  });

  test("footer shows MIT license and current year", async ({ page }) => {
    const year = new Date().getFullYear().toString();
    const footer = page.locator("footer");
    await expect(footer).toContainText("MIT License");
    await expect(footer).toContainText(year);
  });
});
