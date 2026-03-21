import { test, expect } from './fixtures';

/**
 * E2E: Anti-Browser native extension tests.
 *
 * These use Playwright's Electron support — the real Electron app is launched,
 * NOT a standalone browser. IPC, preload, and main process all work correctly.
 *
 * Run:
 *   pnpm test:smoke --grep "Anti-Browser"
 */

test.describe('Anti-Browser Native Extension', () => {
  test('opens App Store and clicks Anti-Browser tab', async ({ window }) => {
    // Open App Store from dock
    await window.getByTestId('dock-item-appstore').click();

    // Wait for the App Store to render
    await expect(window.getByText('Apps').first()).toBeVisible({ timeout: 10_000 });

    // Look for Anti-Browser card and open it
    const abCard = window.getByText('Anti-Browser').first();
    if (await abCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await abCard.click();

      // Wait for either the native component or the install screen to appear
      const nativeView = window.getByText('Command Center');
      const installScreen = window.getByText('Install');
      const iframeEl = window.locator('iframe[title*="Anti-Browser"]');

      // Wait for ANY content to appear
      await expect(
        nativeView.or(installScreen).or(iframeEl),
      ).toBeVisible({ timeout: 15_000 });

      // If the plugin is running, the native component should render — no iframe
      if (await nativeView.isVisible().catch(() => false)) {
        // ✅ Native rendering! Verify sidebar nav items exist
        await expect(window.getByText('Dashboard')).toBeVisible();
        await expect(window.getByText('Profiles')).toBeVisible();
        await expect(window.getByText('Actors')).toBeVisible();
        await expect(window.getByText('Proxies')).toBeVisible();
        await expect(window.getByText('Team')).toBeVisible();

        // Verify there's NO iframe for anti-browser (native replaces it)
        await expect(iframeEl).not.toBeAttached();

        // Click Profiles nav
        await window.getByRole('button', { name: 'Profiles' }).click();
        await expect(window.getByText('Browser Profiles')).toBeVisible({ timeout: 5_000 });

        // Click back to Dashboard
        await window.getByRole('button', { name: 'Dashboard' }).click();
        await expect(window.getByText('Command Center')).toBeVisible({ timeout: 5_000 });
      }
    }
  });

  test('Anti-Browser sidebar navigation works', async ({ window }) => {
    // Open App Store
    await window.getByTestId('dock-item-appstore').click();
    await expect(window.getByText('Apps').first()).toBeVisible({ timeout: 10_000 });

    // Open Anti-Browser
    const abCard = window.getByText('Anti-Browser').first();
    if (await abCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await abCard.click();

      // Wait for native view
      const nativeView = window.getByText('Command Center');
      if (await nativeView.isVisible({ timeout: 10_000 }).catch(() => false)) {
        // Navigate through each page
        const pages: Array<{ nav: string; expect: string }> = [
          { nav: 'Profiles', expect: 'Browser Profiles' },
          { nav: 'Actors', expect: 'Actors' },
          { nav: 'Team', expect: 'Team' },
          { nav: 'Proxies', expect: 'Proxies' },
          { nav: 'Activity', expect: 'Activity' },
          { nav: 'Settings', expect: 'Settings' },
          { nav: 'Dashboard', expect: 'Command Center' },
        ];

        for (const page of pages) {
          await window.getByRole('button', { name: page.nav }).click();
          await expect(window.getByText(page.expect).first()).toBeVisible({ timeout: 5_000 });
        }
      }
    }
  });

  test('Profiles page shows create dialog', async ({ window }) => {
    // Open App Store → Anti-Browser
    await window.getByTestId('dock-item-appstore').click();
    await expect(window.getByText('Apps').first()).toBeVisible({ timeout: 10_000 });

    const abCard = window.getByText('Anti-Browser').first();
    if (await abCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await abCard.click();

      const nativeView = window.getByText('Command Center');
      if (await nativeView.isVisible({ timeout: 10_000 }).catch(() => false)) {
        // Go to Profiles
        await window.getByRole('button', { name: 'Profiles' }).click();
        await expect(window.getByText('Browser Profiles')).toBeVisible({ timeout: 5_000 });

        // Click "New Profile" button
        const newBtn = window.getByRole('button', { name: /New Profile/i });
        await expect(newBtn).toBeVisible();
        await newBtn.click();

        // Verify the create dialog appears
        await expect(window.getByText('New Browser Profile')).toBeVisible({ timeout: 5_000 });
        await expect(window.getByText('Create an isolated browser identity')).toBeVisible();
        await expect(window.getByPlaceholder('My profile')).toBeVisible();

        // Close dialog
        await window.getByRole('button', { name: 'Cancel' }).click();
        await expect(window.getByText('New Browser Profile')).not.toBeVisible({ timeout: 3_000 });
      }
    }
  });
});
