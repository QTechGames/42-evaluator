/**
 * Shared helpers for the 42-Challenge frontend evaluator tests.
 */
import { expect, type Page, type TestInfo } from '@playwright/test';

// ── Selector constants ─────────────────────────────────────────────────────
export const SEL = {
  gameCard: '[data-testid="game-card"]',
  searchInput: '[data-testid="search-input"]',
  categoryFilter: '[data-testid="category-filter"]',
  providerFilter: '[data-testid="provider-filter"]',
  gameDetail: '[data-testid="game-detail"]',
  launchButton: '[data-testid="launch-button"]',
  modeSelector: '[data-testid="mode-selector"]',
  loading: '[data-testid="loading"]',
  errorMessage: '[data-testid="error-message"]',
  emptyState: '[data-testid="empty-state"]',
  walletBalance: '[data-testid="wallet-balance"]',
  betAmount: '[data-testid="bet-amount"]',
  betButton: '[data-testid="bet-button"]',

  // Semantic fallbacks
  pagination: 'nav[aria-label="Pagination"]',
  paginationNext: 'nav[aria-label="Pagination"] button:has-text("Next")',
  paginationPrev: 'nav[aria-label="Pagination"] button:has-text("Prev")',
  retryButton: 'button:has-text("Retry")',
  backLink: 'a:has-text("Back to catalog"), a:has-text("← Back")',
  modeReal: '[data-testid="mode-selector"] input[value="real"]',
  modeDemo: '[data-testid="mode-selector"] input[value="demo"]',
  launchSuccess: '.launch-result--success',
} as const;

// ── Score annotation helper ────────────────────────────────────────────────

export function scoreAnnotation(
  testInfo: TestInfo,
  trial: string,
  criterion: string,
  maxPts: number,
): void {
  testInfo.annotations.push({
    type: 'score',
    description: JSON.stringify({ trial, criterion, maxPts }),
  });
}

// ── Frontend availability guard ────────────────────────────────────────────

/**
 * Call this at the start of a test to skip gracefully when the frontend
 * is not running (FRONTEND_AVAILABLE=false set by action.yml probe step).
 */
export function skipIfUnavailable(testInfo: TestInfo): void {
  if (process.env['FRONTEND_AVAILABLE'] === 'false') {
    testInfo.skip(true, 'Frontend not available — skipping');
  }
}

// ── Wait helpers ───────────────────────────────────────────────────────────

/** Wait for the loading spinner to disappear. */
export async function waitForLoadingDone(page: Page): Promise<void> {
  // If a loading indicator appears, wait for it to go away
  try {
    await page.waitForSelector(SEL.loading, {
      state: 'detached',
      timeout: 15_000,
    });
  } catch {
    // No loading indicator — that's fine
  }
}

/** Wait for network requests to settle and loading to finish. */
export async function waitForStable(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 15_000 });
  await waitForLoadingDone(page);
}

// ── Game card helpers ──────────────────────────────────────────────────────

/**
 * Returns all visible game card elements.
 * Waits up to 10s for at least one card to appear.
 */
export async function getGameCards(page: Page) {
  await page.waitForSelector(SEL.gameCard, { timeout: 10_000 });
  return page.locator(SEL.gameCard);
}

/**
 * Clicks the first game card and waits for the detail view.
 * Returns the game ID extracted from the URL.
 */
export async function openFirstGame(page: Page): Promise<string> {
  const cards = await getGameCards(page);
  await cards.first().click();
  await page.waitForSelector(SEL.gameDetail, { timeout: 10_000 });
  const url = page.url();
  const match = /\/games\/([^/?#]+)/.exec(url);

  return match?.[1] ?? '';
}

// ── URL param helpers ──────────────────────────────────────────────────────

export function getSearchParam(page: Page, name: string): string {
  return new URL(page.url()).searchParams.get(name) ?? '';
}

// ── Network interception helpers ───────────────────────────────────────────

let requestCount = 0;
let requestCounterActive = false;

export function startCountingRequests(page: Page, pattern: string): void {
  requestCount = 0;
  requestCounterActive = true;
  page.on('request', (req) => {
    if (requestCounterActive && req.url().includes(pattern)) {
      requestCount++;
    }
  });
}

export function stopCountingRequests(): number {
  requestCounterActive = false;

  return requestCount;
}

// ── Balance helpers ────────────────────────────────────────────────────────

/** Reads the numeric value from the wallet-balance element. */
export async function readBalance(page: Page): Promise<number> {
  const text = await page
    .locator(SEL.walletBalance)
    .textContent({ timeout: 8_000 });
  const match = /[\d,.]+/.exec(text ?? '');

  return match ? parseFloat(match[0].replace(',', '')) : NaN;
}

// ── Assertion helpers ──────────────────────────────────────────────────────

/** Assert that no JS errors were thrown during the test. */
export function setupConsoleErrorListener(
  page: Page,
): () => string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Skip resource-load failures (image/font/CDN 404s, DNS failures).
      // These are network-level errors, not JavaScript errors.
      if (
        text.includes('Failed to load resource') ||
        text.includes('net::ERR_') ||
        text.includes('ERR_NAME_NOT_RESOLVED')
      ) {
        return;
      }
      errors.push(text);
    }
  });
  page.on('pageerror', (err) => {
    errors.push(err.message);
  });

  return () => errors;
}

// ── Viewport helpers ───────────────────────────────────────────────────────

export async function setMobileViewport(page: Page): Promise<void> {
  await page.setViewportSize({ width: 375, height: 812 });
}

export async function setDesktopViewport(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
}

// ── No-horizontal-scroll assertion ────────────────────────────────────────

export async function assertNoHorizontalScroll(
  page: Page,
): Promise<void> {
  const hasHScroll = await page.evaluate(
    () => document.body.scrollWidth > window.innerWidth,
  );
  expect(hasHScroll).toBe(false);
}
