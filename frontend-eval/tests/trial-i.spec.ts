/**
 * Trial I (FE) — The Awakening  [5 pts]
 *
 * Criteria:
 *  - App loads without JS errors               (3 pts)
 *  - Visible heading + non-empty document.title (2 pts)
 */
import { test, expect } from '@playwright/test';
import {
  scoreAnnotation,
  skipIfUnavailable,
  setupConsoleErrorListener,
  waitForStable,
} from './helpers';

const TRIAL = 'I(FE)';

test('App loads without JS errors', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_load_no_errors', 3);

  const getErrors = setupConsoleErrorListener(page);

  await page.goto('/');
  await waitForStable(page);

  const errors = getErrors();
  expect(
    errors,
    `Unexpected JS errors on load: ${errors.join('; ')}`,
  ).toHaveLength(0);
});

test('Visible heading and non-empty document.title', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_load_heading', 2);

  await page.goto('/');
  await waitForStable(page);

  // document.title must not be empty
  const title = await page.title();
  expect(title.trim().length, 'document.title is empty').toBeGreaterThan(0);

  // At least one visible h1, h2, or branded element
  const heading = page
    .locator('h1, h2, [data-testid="branding"], header')
    .first();
  await expect(heading).toBeVisible();

  const headingText = await heading.textContent();
  expect(
    headingText?.trim().length ?? 0,
    'Heading element has no text',
  ).toBeGreaterThan(0);
});
