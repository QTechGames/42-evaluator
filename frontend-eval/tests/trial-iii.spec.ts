/**
 * Trial III (FE) — Artifact Inspection  [10 pts]
 *
 * Criteria:
 *  - Clicking a game card opens a detail view             (2 pts)
 *  - Detail shows: name, provider, category, RTP,
 *    volatility, enabled status, thumbnail               (4 pts)
 *  - Back navigation preserves filter/scroll state        (2 pts)
 *  - Non-existent game shows error (not blank page)       (2 pts)
 */
import { test, expect } from '@playwright/test';
import {
  scoreAnnotation,
  skipIfUnavailable,
  waitForStable,
  getGameCards,
  openFirstGame,
  SEL,
} from './helpers';

const TRIAL = 'III(FE)';

test('Clicking a game card opens a detail view', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_detail_opens', 2);

  await page.goto('/');
  await waitForStable(page);

  const urlBefore = page.url();
  await openFirstGame(page);

  // URL must have changed to /games/:id
  expect(page.url(), 'URL did not change after clicking card').not.toBe(urlBefore);
  expect(page.url(), 'URL does not match /games/:id pattern').toMatch(/\/games\/[^/?#]+/);

  // Detail view must be visible
  await expect(page.locator(SEL.gameDetail)).toBeVisible();
});

test('Detail view shows all required fields', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_detail_fields', 4);

  await page.goto('/');
  await waitForStable(page);
  await openFirstGame(page);

  const detail = page.locator(SEL.gameDetail);
  await expect(detail).toBeVisible();

  // Name — h1 or h2 inside the detail section
  const nameEl = detail.locator('h1, h2').first();
  await expect(nameEl).toBeVisible();
  const nameText = await nameEl.textContent();
  expect(nameText?.trim().length ?? 0, 'Detail has no game name').toBeGreaterThan(0);

  // Provider — look for "provider" text inside the detail
  const providerEl = detail
    .locator('[class*="provider"], dt:has-text("Provider") + dd, *:has-text("NetEnt"), *:has-text("Pragmatic")')
    .first();
  // Fallback: just check the detail section contains "provider" label text
  const detailText = await detail.textContent();
  expect(
    detailText?.toLowerCase().includes('provider'),
    'Detail does not contain "provider" label',
  ).toBe(true);

  // Category
  expect(
    detailText?.toLowerCase().includes('category') ||
      detailText?.toLowerCase().includes('slots') ||
      detailText?.toLowerCase().includes('live') ||
      detailText?.toLowerCase().includes('table'),
    'Detail does not contain category information',
  ).toBe(true);

  // RTP — look for "rtp" or "%" in text
  expect(
    detailText?.toLowerCase().includes('rtp') ||
      detailText?.includes('%'),
    'Detail does not contain RTP information',
  ).toBe(true);

  // Volatility
  expect(
    detailText?.toLowerCase().includes('volat') ||
      detailText?.toLowerCase().includes('low') ||
      detailText?.toLowerCase().includes('medium') ||
      detailText?.toLowerCase().includes('high'),
    'Detail does not contain volatility information',
  ).toBe(true);

  // Enabled status
  expect(
    detailText?.toLowerCase().includes('enabled') ||
      detailText?.toLowerCase().includes('disabled') ||
      detailText?.toLowerCase().includes('status'),
    'Detail does not contain enabled/disabled status',
  ).toBe(true);

  // Thumbnail image
  const img = detail.locator('img').first();
  await expect(img, 'Detail has no thumbnail image').toBeVisible();
  const src = await img.getAttribute('src');
  expect(src?.trim().length ?? 0, 'Thumbnail img has no src').toBeGreaterThan(0);
});

test('Back navigation preserves filter state', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_detail_back_nav', 2);

  // Apply a category filter first
  await page.goto('/');
  await waitForStable(page);

  const categorySelect = page.locator(SEL.categoryFilter);
  if (await categorySelect.isVisible()) {
    await categorySelect.selectOption({ value: 'slots' });
    await waitForStable(page);
  }

  // Record URL (with filter params)
  const catalogUrl = page.url();

  // Open a game
  const cards = await getGameCards(page);
  await cards.first().click();
  await page.waitForSelector(SEL.gameDetail, { timeout: 10_000 });

  // Navigate back using browser history (preserves URL state)
  await page.goBack();
  await waitForStable(page);

  // Filter should still be applied — check URL still has category param
  const urlAfterBack = page.url();
  expect(
    urlAfterBack,
    'URL after back navigation does not contain category filter',
  ).toContain('category=');

  // Category select should still show the filtered value
  if (await categorySelect.isVisible()) {
    const selectedValue = await categorySelect.inputValue();
    expect(
      selectedValue,
      'Category filter was reset after back navigation',
    ).toBe('slots');
  }
});

test('Non-existent game shows error, not blank page', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_detail_404', 2);

  const jsErrors: string[] = [];
  page.on('pageerror', (err) => jsErrors.push(err.message));

  await page.goto('/games/this-game-does-not-exist-xyz-404');
  await waitForStable(page);

  // Should show an error message — not a blank page
  const errorEl = page.locator(SEL.errorMessage);
  const detailEl = page.locator(SEL.gameDetail);
  const bodyText = await page.locator('body').textContent();

  const hasError = await errorEl.isVisible().catch(() => false);
  const hasNotFoundText =
    bodyText?.toLowerCase().includes('not found') ||
    bodyText?.toLowerCase().includes('error') ||
    bodyText?.toLowerCase().includes("doesn't exist") ||
    bodyText?.toLowerCase().includes("does not exist");

  expect(
    hasError || hasNotFoundText,
    'Non-existent game shows blank page instead of an error',
  ).toBe(true);

  // No JS exceptions
  expect(
    jsErrors,
    `JS exceptions thrown for non-existent game: ${jsErrors.join('; ')}`,
  ).toHaveLength(0);
});
