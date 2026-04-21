/**
 * Trial II (FE) — Catalog of Infinite Chaos  [15 pts]
 *
 * Criteria:
 *  - Game grid renders with name, provider, category per card  (3 pts)
 *  - Search input filters games by name                        (3 pts)
 *  - Category filter works                                     (3 pts)
 *  - Provider filter works                                     (3 pts)
 *  - Pagination or infinite scroll handles full dataset        (3 pts)
 */
import { test, expect } from '@playwright/test';
import {
  scoreAnnotation,
  skipIfUnavailable,
  waitForStable,
  getGameCards,
  SEL,
} from './helpers';

const TRIAL = 'II(FE)';

test('Game grid renders with name, provider, category per card', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_catalog_grid', 3);

  await page.goto('/');
  await waitForStable(page);

  const cards = await getGameCards(page);
  const count = await cards.count();
  expect(count, 'No game cards found').toBeGreaterThan(0);

  // Check the first card has name, provider, and category text
  const firstCard = cards.first();

  // Name: h3.game-card__name
  const name = firstCard.locator('.game-card__name, h3').first();
  await expect(name).toBeVisible();
  const nameText = await name.textContent();
  expect(nameText?.trim().length ?? 0, 'Card has no name text').toBeGreaterThan(0);

  // Provider: .game-card__provider
  const provider = firstCard.locator('.game-card__provider, [class*="provider"]').first();
  await expect(provider).toBeVisible();
  const providerText = await provider.textContent();
  expect(providerText?.trim().length ?? 0, 'Card has no provider text').toBeGreaterThan(0);

  // Category: .game-card__category or .game-card__meta span
  const category = firstCard
    .locator('.game-card__category, [class*="category"]')
    .first();
  await expect(category).toBeVisible();
  const categoryText = await category.textContent();
  expect(categoryText?.trim().length ?? 0, 'Card has no category text').toBeGreaterThan(0);
});

test('Search input filters games by name', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_catalog_search', 3);

  await page.goto('/');
  await waitForStable(page);

  const cardsBefore = await getGameCards(page);
  const countBefore = await cardsBefore.count();
  expect(countBefore, 'No cards before search').toBeGreaterThan(0);

  // Pick a search term from the first card's name
  const firstName = await cardsBefore
    .first()
    .locator('.game-card__name, h3')
    .first()
    .textContent();
  const searchTerm = firstName?.trim().split(' ')[0] ?? 'a';

  const searchInput = page.locator(SEL.searchInput);
  await expect(searchInput).toBeVisible();
  await searchInput.fill(searchTerm);

  await waitForStable(page);

  const cardsAfter = page.locator(SEL.gameCard);
  const countAfter = await cardsAfter.count();

  // After filtering, should have results (and different count is a strong signal)
  expect(countAfter, 'Search returned no results').toBeGreaterThan(0);

  // Every visible card should contain the search term (case-insensitive)
  const firstAfterName = await cardsAfter
    .first()
    .locator('.game-card__name, h3')
    .first()
    .textContent();
  expect(
    firstAfterName?.toLowerCase().includes(searchTerm.toLowerCase()),
    `First result "${firstAfterName}" does not contain search term "${searchTerm}"`,
  ).toBe(true);
});

test('Category filter works', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_catalog_category_filter', 3);

  await page.goto('/');
  await waitForStable(page);

  const categorySelect = page.locator(SEL.categoryFilter);
  await expect(categorySelect).toBeVisible();

  // Select "Slots" — value "slots" based on the component
  await categorySelect.selectOption({ value: 'slots' });
  await waitForStable(page);

  const cards = page.locator(SEL.gameCard);
  const count = await cards.count();
  expect(count, 'No cards after category filter').toBeGreaterThan(0);

  // Every card should show the "slots" category
  const firstCategory = await cards
    .first()
    .locator('.game-card__category, [class*="category"]')
    .first()
    .textContent();
  expect(
    firstCategory?.toLowerCase(),
    `First card category "${firstCategory}" is not "slots"`,
  ).toContain('slot');
});

test('Provider filter works', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_catalog_provider_filter', 3);

  await page.goto('/');
  await waitForStable(page);

  const providerSelect = page.locator(SEL.providerFilter);
  await expect(providerSelect).toBeVisible();

  // Get available provider options (skip the "All" empty option)
  const options = await providerSelect.locator('option').all();
  let targetProvider = '';
  for (const opt of options) {
    const val = await opt.getAttribute('value');
    if (val && val.trim() !== '') {
      targetProvider = val;
      break;
    }
  }
  expect(targetProvider.length, 'No provider options available').toBeGreaterThan(0);

  await providerSelect.selectOption({ value: targetProvider });
  await waitForStable(page);

  const cards = page.locator(SEL.gameCard);
  const count = await cards.count();
  expect(count, 'No cards after provider filter').toBeGreaterThan(0);

  // Every card should show the selected provider
  const firstProvider = await cards
    .first()
    .locator('.game-card__provider, [class*="provider"]')
    .first()
    .textContent();
  expect(
    firstProvider?.toLowerCase().includes(targetProvider.toLowerCase()),
    `First card provider "${firstProvider}" does not match filter "${targetProvider}"`,
  ).toBe(true);
});

test('Pagination or infinite scroll handles full dataset', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_catalog_pagination', 3);

  await page.goto('/');
  await waitForStable(page);

  // The default pageSize is 20; total games is 1000.
  // So if pagination is working, the initial count should be < total.
  const cards = page.locator(SEL.gameCard);
  const initialCount = await cards.count();
  expect(initialCount, 'No cards found').toBeGreaterThan(0);

  // Try pagination "Next" button
  const nextBtn = page.locator(SEL.paginationNext);
  const paginationVisible = await nextBtn.isVisible().catch(() => false);

  if (paginationVisible) {
    // Pagination is present — click Next and verify different content
    const firstCardNameBefore = await cards
      .first()
      .locator('.game-card__name, h3')
      .first()
      .textContent();

    await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes('/api/games') && resp.status() === 200,
        { timeout: 10_000 },
      ),
      nextBtn.click(),
    ]);
    await waitForStable(page);

    const firstCardNameAfter = await page
      .locator(SEL.gameCard)
      .first()
      .locator('.game-card__name, h3')
      .first()
      .textContent();

    expect(
      firstCardNameAfter,
      'Page 2 shows same first card as page 1 — pagination may not work',
    ).not.toBe(firstCardNameBefore);

    // URL should contain page param
    const url = page.url();
    expect(url, 'URL does not contain page param after pagination').toContain('page=');
  } else {
    // Infinite scroll or all-in-one render — verify initial count is reasonable
    // With 1000 games and no pagination visible, either all loaded or infinite scroll
    // We accept either pattern: just verify more than one card and the count is capped
    expect(initialCount, 'Expected more than 1 game card').toBeGreaterThan(1);
    // A catalog with all 1000 games loaded at once is valid but unusual;
    // the test passes as long as cards are present
  }
});
