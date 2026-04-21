/**
 * Trial VIII — State Management & Loading UX  [20 pts]
 *
 * Criteria:
 *  - Loading indicators during fetch (not blank page)          (4 pts)
 *  - Error boundary: retry button on API failure               (4 pts)
 *  - Empty state: zero results show "no results" message       (4 pts)
 *  - URL-driven state: filters/page in URL, preserved on reload (4 pts)
 *  - Debounced search: max 2 requests for rapid typing         (4 pts)
 */
import { test, expect } from '@playwright/test';
import {
  scoreAnnotation,
  skipIfUnavailable,
  waitForStable,
  SEL,
} from './helpers';

const TRIAL = 'VIII';

test('Loading indicator appears during data fetch', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_loading_indicator', 4);

  // Delay the games API response so we can observe the loading state
  await page.route('**/api/games*', async (route) => {
    await new Promise<void>((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });

  let loadingDetected = false;

  // Watch for loading indicator in DOM (attached, not necessarily visible)
  const loadingWatcher = page
    .waitForSelector(`${SEL.loading}, [aria-busy="true"]`, {
      state: 'attached',
      timeout: 500,
    })
    .then(() => {
      loadingDetected = true;
    })
    .catch(() => {});

  await page.goto('/');

  await loadingWatcher;
  await page.unroute('**/api/games*');
  await waitForStable(page);

  expect(
    loadingDetected,
    `No loading indicator (${SEL.loading} or [aria-busy="true"]) appeared within 500ms of navigation`,
  ).toBe(true);
});

test('Error boundary shows retry button on API failure', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_error_boundary', 4);

  // Abort all games API requests
  await page.route('**/api/games*', (route) => route.abort('failed'));

  await page.goto('/');
  await waitForStable(page);

  // Error message should be visible
  const errorEl = page.locator(SEL.errorMessage);
  await expect(
    errorEl,
    'No error message shown when API fails',
  ).toBeVisible({ timeout: 10_000 });

  // Retry button must be present inside or near the error message
  const retryBtn = page
    .locator(`${SEL.errorMessage} button, button:has-text("Retry"), button:has-text("retry")`)
    .first();
  await expect(
    retryBtn,
    'No retry button found in error state',
  ).toBeVisible({ timeout: 5_000 });

  // Unblock the API and click retry — games should load
  await page.unroute('**/api/games*');
  await retryBtn.click();
  await waitForStable(page);

  // After retry, game cards should be visible
  const cards = page.locator(SEL.gameCard);
  await expect(
    cards.first(),
    'Games did not load after clicking Retry',
  ).toBeVisible({ timeout: 10_000 });
});

test('Empty state shows "no results" message on zero results', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_empty_state', 4);

  await page.goto('/');
  await waitForStable(page);

  const searchInput = page.locator(SEL.searchInput);
  await expect(searchInput).toBeVisible();

  // Type a nonsense string that will return 0 results
  await searchInput.fill('zzz_no_game_will_match_this_query_xyz_12345');
  // Wait for the 300ms debounce to fire before checking for network idle
  await page.waitForTimeout(600);
  await waitForStable(page);

  // Empty state element must be visible
  const emptyEl = page.locator(SEL.emptyState);
  const hasEmptyEl = await emptyEl.isVisible().catch(() => false);

  if (hasEmptyEl) {
    const emptyText = await emptyEl.textContent();
    expect(
      emptyText?.trim().length ?? 0,
      'Empty state element has no text',
    ).toBeGreaterThan(0);
  } else {
    // Fallback: "no games" or similar text visible anywhere
    const bodyText = await page.locator('body').textContent();
    const hasNoResultsText =
      bodyText?.toLowerCase().includes('no games') ||
      bodyText?.toLowerCase().includes('no results') ||
      bodyText?.toLowerCase().includes('nothing found') ||
      bodyText?.toLowerCase().includes('0 game');
    expect(
      hasNoResultsText,
      'No empty state message visible when search returns 0 results',
    ).toBe(true);
  }

  // No game cards should be visible
  const cards = page.locator(SEL.gameCard);
  const cardCount = await cards.count();
  expect(
    cardCount,
    `Expected 0 cards for nonsense search, got ${cardCount}`,
  ).toBe(0);
});

test('URL-driven state: filters persisted in URL and restored on reload', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_url_state', 4);

  await page.goto('/');
  await waitForStable(page);

  // Apply search
  const searchInput = page.locator(SEL.searchInput);
  await expect(searchInput).toBeVisible();
  await searchInput.fill('fire');
  await waitForStable(page);

  // Apply category filter
  const categorySelect = page.locator(SEL.categoryFilter);
  if (await categorySelect.isVisible()) {
    await categorySelect.selectOption({ value: 'slots' });
    await waitForStable(page);
  }

  // Check URL contains the filter params
  const urlAfterFilter = page.url();
  expect(
    urlAfterFilter.includes('search=') || urlAfterFilter.includes('category='),
    `URL does not contain filter params after applying filters: ${urlAfterFilter}`,
  ).toBe(true);

  // Reload the page — state should be preserved
  await page.reload();
  await waitForStable(page);

  // Search input should still have the value
  const searchValueAfterReload = await searchInput.inputValue().catch(() => '');
  const urlAfterReload = page.url();

  const statePreserved =
    searchValueAfterReload.toLowerCase().includes('fire') ||
    urlAfterReload.includes('search=fire') ||
    urlAfterReload.includes('search=');

  expect(
    statePreserved,
    `Filter state not preserved after reload. URL: ${urlAfterReload}, search value: "${searchValueAfterReload}"`,
  ).toBe(true);
});

test('Debounced search fires at most 2 requests for rapid typing', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_debounced_search', 4);

  await page.goto('/');
  await waitForStable(page);

  let requestCount = 0;
  page.on('request', (req) => {
    if (req.url().includes('/api/games') && req.method() === 'GET') {
      requestCount++;
    }
  });

  // Reset counter after initial load
  requestCount = 0;

  const searchInput = page.locator(SEL.searchInput);
  await expect(searchInput).toBeVisible();

  // Type 6 characters rapidly (no delay between keystrokes)
  await searchInput.click();
  await page.keyboard.type('golden', { delay: 30 });

  // Wait for debounce to fire (300ms debounce + some buffer)
  await page.waitForTimeout(600);
  await waitForStable(page);

  expect(
    requestCount,
    `Expected at most 2 API requests for rapid typing, got ${requestCount}. Search is not debounced.`,
  ).toBeLessThanOrEqual(2);
});
