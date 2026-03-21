import { _electron as electron, expect, test } from '@playwright/test';

test('launches the Electron app and verifies core UI', async () => {
  const app = await electron.launch({
    args: ['.'],
    timeout: 60_000,
  });
  const window = await app.firstWindow();

  await window.waitForLoadState('domcontentloaded');

  // Desktop shell
  await expect(window.locator('.desktop-shell')).toBeVisible({ timeout: 15_000 });

  // Top bar
  await expect(window.getByText('Control Center')).toBeVisible();

  // Dock items
  await expect(window.getByTestId('dock-item-finder')).toBeVisible();
  await expect(window.getByTestId('dock-item-launchpad')).toBeVisible();

  await app.close();
});

test('opens Messages app from Launchpad', async () => {
  const app = await electron.launch({
    args: ['.'],
    timeout: 60_000,
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await expect(window.locator('.desktop-shell')).toBeVisible({ timeout: 15_000 });

  // Open Launchpad
  await window.getByTestId('dock-item-launchpad').click();
  await expect(window.getByRole('dialog', { name: 'Launchpad' })).toBeVisible();

  // Search for Messages
  await window.getByRole('searchbox', { name: 'Search apps' }).fill('Messages');
  await window.getByRole('button', { name: 'Messages' }).click();

  // Verify Messages app window opens
  await expect(window.getByRole('heading', { name: 'PocketPaw' })).toBeVisible({ timeout: 10_000 });
  await expect(window.getByPlaceholder('Message PocketPaw…')).toBeVisible();

  await app.close();
});

test('opens Notes app from Launchpad', async () => {
  const app = await electron.launch({
    args: ['.'],
    timeout: 60_000,
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await expect(window.locator('.desktop-shell')).toBeVisible({ timeout: 15_000 });

  // Open Launchpad → search Notes
  await window.getByTestId('dock-item-launchpad').click();
  await window.getByRole('searchbox', { name: 'Search apps' }).fill('Notes');
  await window.getByRole('button', { name: 'Notes' }).click();

  // Verify Notes app renders
  await expect(window.getByPlaceholder('Search memories…')).toBeVisible({ timeout: 10_000 });

  await app.close();
});

test('opens Reminders app from Launchpad', async () => {
  const app = await electron.launch({
    args: ['.'],
    timeout: 60_000,
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await expect(window.locator('.desktop-shell')).toBeVisible({ timeout: 15_000 });

  // Open Launchpad → search Reminders
  await window.getByTestId('dock-item-launchpad').click();
  await window.getByRole('searchbox', { name: 'Search apps' }).fill('Reminders');
  await window.getByRole('button', { name: 'Reminders' }).click();

  // Verify Reminders app renders
  await expect(
    window.getByPlaceholder(/add a reminder/i),
  ).toBeVisible({ timeout: 10_000 });

  await app.close();
});

test('opens App Store and shows extensions', async () => {
  const app = await electron.launch({
    args: ['.'],
    timeout: 60_000,
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await expect(window.locator('.desktop-shell')).toBeVisible({ timeout: 15_000 });

  // Click App Store from dock
  await window.getByTestId('dock-item-appstore').click();

  // Verify the App Store renders
  await expect(window.getByRole('heading', { name: 'Apps' })).toBeVisible({
    timeout: 10_000,
  });
  await expect(window.getByPlaceholder('Search extensions…')).toBeVisible();

  // Find first "Open" button (installed extension) and click it
  const openBtn = window.getByRole('button', { name: 'Open' }).first();
  if (await openBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await openBtn.click();

    // Verify detail toolbar appears with back button
    await expect(
      window.getByRole('button', { name: /apps/i }).first(),
    ).toBeVisible({ timeout: 5_000 });

    // Verify iframe loads (the iframe element itself)
    await expect(window.locator('iframe').first()).toBeAttached({ timeout: 10_000 });

    // Click back to return to list
    await window.getByRole('button', { name: /apps/i }).first().click();
    await expect(window.getByRole('heading', { name: 'Apps' })).toBeVisible({
      timeout: 5_000,
    });
  }

  await app.close();
});
