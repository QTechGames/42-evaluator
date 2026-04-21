/**
 * Trial IX — Accessibility & Performance  [15 pts]
 *
 * Playwright covers (8 pts):
 *  - Keyboard navigation: all elements reachable via Tab   (3 pts)
 *  - ARIA + semantic HTML: zero critical axe-core violations (3 pts)
 *  - Responsive at 375px mobile width                      (2 pts)
 *
 * Lighthouse covers (7 pts) — injected by merge-lh-scores.js:
 *  - Lighthouse accessibility >= 80                        (4 pts)
 *  - Lighthouse performance >= 70                          (3 pts)
 *
 * Boss — The Lighthouse Sentinel (+10 pts):
 *  - Lighthouse performance >= 90 — injected by merge-lh-scores.js
 */
import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import {
  scoreAnnotation,
  skipIfUnavailable,
  waitForStable,
  setMobileViewport,
  setDesktopViewport,
  assertNoHorizontalScroll,
  SEL,
  getGameCards,
} from './helpers';

const TRIAL = 'IX';

test('Keyboard navigation: interactive elements reachable via Tab', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_a11y_keyboard_nav', 3);

  await page.goto('/');
  await waitForStable(page);

  // Focus the document body and start tabbing
  await page.keyboard.press('Tab');

  // Track focused elements across Tab presses
  const focusedTags: string[] = [];
  for (let i = 0; i < 15; i++) {
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? `${el.tagName}[${el.getAttribute('data-testid') ?? el.getAttribute('role') ?? ''}]` : 'none';
    });
    focusedTags.push(focused);
    await page.keyboard.press('Tab');
  }

  // Must have visited some interactive elements
  const interactiveTags = focusedTags.filter((t) =>
    /^(A|BUTTON|INPUT|SELECT|TEXTAREA)\[/.test(t),
  );
  expect(
    interactiveTags.length,
    `Tab navigation didn't reach any interactive elements. Visited: ${focusedTags.join(', ')}`,
  ).toBeGreaterThan(0);

  // Search input should be reachable
  const searchReachable = focusedTags.some((t) =>
    t.includes('search-input') || t.includes('INPUT'),
  );
  expect(
    searchReachable,
    'Search input not reachable via Tab navigation',
  ).toBe(true);
});

test('ARIA and semantic HTML: zero critical axe-core violations', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_a11y_axe', 3);

  await page.goto('/');
  await waitForStable(page);

  const axeResults = await new AxeBuilder({ page }).analyze();
  const violations = axeResults.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  if (violations.length > 0) {
    throw new Error(
      `axe-core found ${violations.length} critical/serious violation(s):\n` +
        violations.map((v) => `  - ${v.id}: ${v.description}`).join('\n'),
    );
  }

  // If we reach here, no critical/serious violations were found
  // Also verify basic semantic structure
  const hasMain = await page.locator('main').count();
  const hasNav = await page.locator('nav').count();
  expect(hasMain, 'Page has no <main> landmark').toBeGreaterThan(0);
  expect(hasNav, 'Page has no <nav> landmark').toBeGreaterThan(0);

  // Images should have alt text
  const imgsWithoutAlt = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs.filter((img) => !img.hasAttribute('alt')).length;
  });
  expect(
    imgsWithoutAlt,
    `${imgsWithoutAlt} images are missing alt attributes`,
  ).toBe(0);
});

test('Responsive layout: usable at 375px mobile width', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_a11y_responsive', 2);

  await setMobileViewport(page);
  await page.goto('/');
  await waitForStable(page);

  // No horizontal scroll at 375px
  await assertNoHorizontalScroll(page);

  // Game cards must still be visible
  const cards = await getGameCards(page);
  const count = await cards.count();
  expect(count, 'No game cards visible at 375px').toBeGreaterThan(0);

  // Search input must be visible
  const searchInput = page.locator(SEL.searchInput);
  await expect(searchInput, 'Search input not visible at 375px').toBeVisible();

  // Restore desktop viewport
  await setDesktopViewport(page);
});
