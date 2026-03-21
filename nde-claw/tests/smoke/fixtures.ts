/**
 * Electron test fixtures for Playwright.
 *
 * Provides `electronApp` and `window` fixtures that launch the built
 * PocketPaw Electron app before each test and tear it down after.
 *
 * Usage:
 *   import { test, expect } from './fixtures';
 *   test('window title', async ({ window }) => {
 *     expect(await window.title()).toContain('macOS Electron');
 *   });
 */

import { test as base, type Page } from '@playwright/test';
import { _electron as electron, type ElectronApplication } from 'playwright';

type ElectronFixtures = {
  electronApp: ElectronApplication;
  window: Page;
};

export const test = base.extend<ElectronFixtures>({
  // biome-ignore lint: Playwright fixture signature requires destructured use
  electronApp: async ({}, use) => {
    const app = await electron.launch({
      args: ['.'],
      timeout: 60_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });
    await use(app);
    await app.close();
  },

  window: async ({ electronApp }, use) => {
    // Wait for the first BrowserWindow to open
    const window = await electronApp.firstWindow();
    // Wait until the renderer has fully loaded
    await window.waitForLoadState('domcontentloaded');
    // Wait for the desktop shell to render
    await window.locator('.desktop-shell').waitFor({ state: 'visible', timeout: 15_000 });
    await use(window);
  },
});

export { expect } from '@playwright/test';
