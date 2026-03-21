import { _electron as electron, expect, test } from '@playwright/test';

test.describe('Electron Auth', () => {
  test('clears the auth overlay and allows dock interaction', async () => {
    const app = await electron.launch({
      args: ['.'],
      timeout: 60_000,
    });
    const window = await app.firstWindow();

    await window.waitForLoadState('domcontentloaded');
    await expect(window.locator('.desktop-shell')).toBeVisible({ timeout: 15_000 });
    await expect(window.locator('.desktop-auth-overlay')).toHaveCount(0, { timeout: 20_000 });

    await window.getByTestId('dock-item-launchpad').click();
    await expect(window.getByRole('dialog', { name: 'Launchpad' })).toBeVisible();

    await app.close();
  });
});
