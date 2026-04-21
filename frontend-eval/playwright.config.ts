import { defineConfig, devices } from '@playwright/test';

const FRONTEND_URL =
  process.env['FRONTEND_URL'] ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './tests',

  // Serial execution — tests share app state and ordering matters
  fullyParallel: false,
  workers: 1,

  // No retries — evaluator must be deterministic
  retries: 0,

  // Fail-fast not set: run all trials even if some fail
  forbidOnly: !!process.env['CI'],

  reporter: [
    ['./reporter/score-reporter.ts'],
    ['list'],
  ],

  use: {
    baseURL: FRONTEND_URL,
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
    // Give enough time for slow CI environments
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Per-test timeout — Lighthouse runs outside Playwright so not counted here
  timeout: 45_000,
});
