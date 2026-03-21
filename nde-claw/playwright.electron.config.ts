import { defineConfig } from '@playwright/test';

/**
 * Electron smoke tests — uses `_electron.launch()` directly in each spec,
 * so we do NOT set `use.baseURL` or browser projects here. Just configure
 * timeouts, test directory, and reporter output.
 */
export default defineConfig({
  testDir: './tests/smoke',
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  retries: 1,
  reporter: [['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
