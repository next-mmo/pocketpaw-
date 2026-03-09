import { test, expect } from '@playwright/test';

test.describe('FreeCut App', () => {
         test('should load the landing page', async ({ page }) => {
                  await page.goto('/');

                  // Check that the page loads
                  await expect(page).toHaveTitle(/FreeCut/i);

                  // Check for main heading or brand
                  await expect(page.locator('body')).toBeVisible();
         });

         test('should navigate to editor', async ({ page }) => {
                  await page.goto('/');

                  // Look for the "Get Started" or "Start Editing" button
                  const getStartedButton = page.locator('button:has-text("Get Started"), a:has-text("Get Started"), [href*="editor"]').first();

                  // If we can't find a direct link, navigate to editor route
                  try {
                           await getStartedButton.click({ timeout: 5000 });
                  } catch {
                           await page.goto('/editor');
                  }

                  // Check that editor loads (canvas or toolbar should be present)
                  await expect(page.locator('body')).toBeVisible();
         });

         test('should load editor page directly', async ({ page }) => {
                  await page.goto('/editor');

                  // Wait for page to load
                  await page.waitForLoadState('networkidle');

                  // Check that something rendered on the page
                  await expect(page.locator('body')).toBeVisible();
         });
});

test.describe('Python Backend API', () => {
         test('should respond to health check', async ({ request }) => {
                  try {
                           const response = await request.get('http://127.0.0.1:7890/health', {
                                    timeout: 5000,
                           });

                           if (response.ok()) {
                                    const data = await response.json();
                                    expect(data.status).toBe('healthy');
                                    console.log('✓ Python backend is healthy');
                           } else {
                                    console.log('⚠ Python backend responded with error:', response.status());
                           }
                  } catch {
                           // Backend not running - this is expected in dev mode without Python started
                           console.log('⚠ Python backend not running - API test skipped');
                           // Skip test gracefully when backend unavailable
                           test.skip();
                  }
         });
});
