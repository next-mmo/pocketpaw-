import { test, expect } from './fixtures';

test('launches the Electron app and verifies core UI', async ({ window }) => {
  // Desktop shell
  await expect(window.locator('.desktop-shell')).toBeVisible();

  // Top bar
  await expect(window.getByText('Control Center')).toBeVisible();

  // Dock items
  await expect(window.getByTestId('dock-item-finder')).toBeVisible();
  await expect(window.getByTestId('dock-item-launchpad')).toBeVisible();
});

test('opens Messages app from Launchpad', async ({ window }) => {
  // Open Launchpad
  await window.getByTestId('dock-item-launchpad').click();
  await expect(window.getByRole('dialog', { name: 'Launchpad' })).toBeVisible();

  // Search for Messages
  await window.getByRole('searchbox', { name: 'Search apps' }).fill('Messages');
  await window.getByRole('button', { name: 'Messages' }).click();

  // Verify Messages app window opens
  await expect(window.getByRole('heading', { name: 'PocketPaw' })).toBeVisible({ timeout: 10_000 });
  await expect(window.getByPlaceholder('Message PocketPaw…')).toBeVisible();
});

test('opens Notes app from Launchpad', async ({ window }) => {
  // Open Launchpad → search Notes
  await window.getByTestId('dock-item-launchpad').click();
  await window.getByRole('searchbox', { name: 'Search apps' }).fill('Notes');
  await window.getByRole('button', { name: 'Notes' }).click();

  // Verify Notes app renders
  await expect(window.getByPlaceholder('Search memories…')).toBeVisible({ timeout: 10_000 });
});

test('opens Reminders app from Launchpad', async ({ window }) => {
  // Open Launchpad → search Reminders
  await window.getByTestId('dock-item-launchpad').click();
  await window.getByRole('searchbox', { name: 'Search apps' }).fill('Reminders');
  await window.getByRole('button', { name: 'Reminders' }).click();

  // Verify Reminders app renders
  await expect(
    window.getByPlaceholder(/add a reminder/i),
  ).toBeVisible({ timeout: 10_000 });
});

test('opens App Store and shows extensions', async ({ window }) => {
  // Click App Store from dock
  await window.getByTestId('dock-item-appstore').click();

  // Verify the App Store renders
  await expect(window.getByText('Apps').first()).toBeVisible({ timeout: 10_000 });

  // Find first "Open" button (installed extension) and click it
  const openBtn = window.getByRole('button', { name: 'Open' }).first();
  if (await openBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await openBtn.click();

    // Verify detail toolbar appears with back button
    await expect(
      window.getByRole('button', { name: /apps/i }).first(),
    ).toBeVisible({ timeout: 5_000 });

    // Verify extension content loads (iframe or native component)
    const hasIframe = await window.locator('iframe').count().then(c => c > 0).catch(() => false);
    const hasNative = await window.locator('[data-slot]').first().isVisible().catch(() => false);
    expect(hasIframe || hasNative).toBeTruthy();

    // Click back to return to list
    await window.getByRole('button', { name: /apps/i }).first().click();
    await expect(window.getByText('Apps').first()).toBeVisible({ timeout: 5_000 });
  }
});
