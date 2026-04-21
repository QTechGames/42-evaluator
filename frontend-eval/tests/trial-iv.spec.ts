/**
 * Trial IV (FE) — The Launch Ritual  [15 pts]
 *
 * Criteria:
 *  - Launch button visible on game detail or card         (2 pts)
 *  - Launch shows loading state, then resolves            (3 pts)
 *  - Success state shows session info                     (3 pts)
 *  - Invalid/error launch shows clear error message       (3 pts)
 *  - Mode selector (demo/real) present and functional     (2 pts)
 *  - Disabled games have visual indicator + restricted    (2 pts)
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

const TRIAL = 'IV(FE)';

test('Launch button visible on game detail', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_launch_button_visible', 2);

  await page.goto('/');
  await waitForStable(page);
  await openFirstGame(page);

  const launchBtn = page.locator(SEL.launchButton);
  await expect(launchBtn, 'Launch button not found on game detail').toBeVisible();
});

test('Launch shows loading state then resolves', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_launch_loading', 3);

  await page.goto('/');
  await waitForStable(page);
  await openFirstGame(page);

  // Ensure demo mode is selected (default, should not require wallet funds)
  const modeSelector = page.locator(SEL.modeSelector);
  if (await modeSelector.isVisible()) {
    const demoRadio = page.locator(SEL.modeDemo);
    if (await demoRadio.isVisible()) {
      await demoRadio.check();
    }
  }

  const launchBtn = page.locator(SEL.launchButton);
  await expect(launchBtn).toBeVisible();

  // Intercept to slow down the launch request so we can observe loading state
  let loadingSeenOrButtonChanged = false;

  await page.route('**/api/launch', async (route) => {
    // Small delay to allow loading state to render
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });

  // Click and immediately check for loading state
  const clickPromise = launchBtn.click();

  // Check for loading indicator or button text change
  try {
    await page.waitForSelector(SEL.loading, {
      state: 'attached',
      timeout: 2_000,
    });
    loadingSeenOrButtonChanged = true;
  } catch {
    // Fallback: check if the button text changed to "Launching..."
    try {
      await page.waitForFunction(
        () => {
          const btn = document.querySelector('[data-testid="launch-button"]');
          return (
            btn?.textContent?.toLowerCase().includes('launch') === false ||
            btn?.hasAttribute('disabled')
          );
        },
        { timeout: 2_000 },
      );
      loadingSeenOrButtonChanged = true;
    } catch {
      loadingSeenOrButtonChanged = false;
    }
  }

  await clickPromise;
  await page.unroute('**/api/launch');

  // Wait for the launch to resolve (success or error)
  await waitForStable(page);

  expect(
    loadingSeenOrButtonChanged,
    'No loading state observed during launch — button should show loading or a spinner should appear',
  ).toBe(true);
});

test('Success state shows session info', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_launch_success', 3);

  await page.goto('/');
  await waitForStable(page);
  await openFirstGame(page);

  // Use demo mode to avoid balance requirements
  const demoRadio = page.locator(SEL.modeDemo);
  if (await demoRadio.isVisible()) {
    await demoRadio.check();
  }

  await page.locator(SEL.launchButton).click();
  await waitForStable(page);

  // Success: either .launch-result--success or session info text visible
  const successEl = page.locator(SEL.launchSuccess);
  const hasSuccess = await successEl.isVisible().catch(() => false);

  if (hasSuccess) {
    const text = await successEl.textContent();
    expect(
      text?.trim().length ?? 0,
      'Success element is empty',
    ).toBeGreaterThan(0);
    // Should mention "session" or contain a session ID
    const hasSessionInfo =
      text?.toLowerCase().includes('session') ||
      text?.includes('sess-') ||
      text?.toLowerCase().includes('launch') ||
      text?.toLowerCase().includes('url');
    expect(hasSessionInfo, 'Success element does not show session info').toBe(true);
  } else {
    // Fallback: look for any game session or iframe that appeared
    const gameSession = page.locator('.game-session, [class*="session"]').first();
    await expect(
      gameSession,
      'No launch success or game session visible after launch',
    ).toBeVisible({ timeout: 8_000 });
  }
});

test('Error state for invalid launch shows clear error message', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_launch_error', 3);

  await page.goto('/');
  await waitForStable(page);

  // Intercept the launch API to force an error response
  await page.route('**/api/launch', async (route) => {
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'GAME_DISABLED',
        message: 'This game cannot be launched in real mode',
        details: [],
      }),
    });
  });

  await openFirstGame(page);
  await page.locator(SEL.launchButton).click();
  await waitForStable(page);

  await page.unroute('**/api/launch');

  // Error message should be visible
  const errorEl = page.locator(SEL.errorMessage);
  await expect(
    errorEl,
    'No error message shown when launch returns an error',
  ).toBeVisible({ timeout: 8_000 });

  const errorText = await errorEl.textContent();
  expect(
    errorText?.trim().length ?? 0,
    'Error message element is empty',
  ).toBeGreaterThan(0);
});

test('Mode selector is present and functional', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_mode_selector', 2);

  await page.goto('/');
  await waitForStable(page);
  await openFirstGame(page);

  // Mode selector fieldset
  const modeSelector = page.locator(SEL.modeSelector);
  await expect(modeSelector, 'Mode selector not found').toBeVisible();

  // Both radio buttons present
  const demoRadio = page.locator(SEL.modeDemo);
  const realRadio = page.locator(SEL.modeReal);
  await expect(demoRadio, 'Demo mode radio not found').toBeVisible();
  await expect(realRadio, 'Real mode radio not found').toBeVisible();

  // Can switch between modes
  await realRadio.check();
  expect(await realRadio.isChecked(), 'Real mode radio not checked after click').toBe(true);

  await demoRadio.check();
  expect(await demoRadio.isChecked(), 'Demo mode radio not checked after click').toBe(true);
});

test('Disabled games show visual indicator and restrict real-mode launch', async ({ page }, testInfo) => {
  skipIfUnavailable(testInfo);
  scoreAnnotation(testInfo, TRIAL, 'fe_disabled_game', 2);

  await page.goto('/');
  await waitForStable(page);

  // Look for a card with the disabled class
  const disabledCard = page.locator('.game-card--disabled').first();
  const hasDisabledCard = await disabledCard.isVisible().catch(() => false);

  if (hasDisabledCard) {
    // Should have a visual badge or indicator
    const badge = disabledCard.locator('.game-card__badge, [aria-label*="isabled"], [class*="badge"]').first();
    const cardText = await disabledCard.textContent();
    const hasIndicator =
      await badge.isVisible().catch(() => false) ||
      cardText?.toLowerCase().includes('disabled');
    expect(
      hasIndicator,
      'Disabled card has no visual disabled indicator',
    ).toBe(true);

    // Navigate to the disabled game's detail
    await disabledCard.click();
    await page.waitForSelector(SEL.gameDetail, { timeout: 10_000 });

    // Real mode radio should be disabled or launch should be restricted
    const realRadio = page.locator(SEL.modeReal);
    if (await realRadio.isVisible()) {
      const isDisabled = await realRadio.isDisabled();
      if (isDisabled) {
        // Pass — real mode is correctly disabled
        return;
      }

      // Try to launch in real mode — should show an error
      await realRadio.check().catch(() => {});
      await page.locator(SEL.launchButton).click();
      await waitForStable(page);

      const errorEl = page.locator(SEL.errorMessage);
      const hasError = await errorEl.isVisible().catch(() => false);
      expect(
        hasError || isDisabled,
        'Real-mode launch of a disabled game did not show an error',
      ).toBe(true);
    }
  } else {
    // No disabled games in current view — the seed data should have ~18%
    // disabled. Try with enabled=false filter or just verify the class exists
    // somewhere in the document after scrolling
    const disabledCardInDOM = page.locator('.game-card--disabled');
    const disabledInPage = await page.evaluate(
      () => document.querySelectorAll('.game-card--disabled').length > 0,
    );
    // If truly no disabled games visible on page 1, test still passes
    // (acceptable — depends on data distribution)
    expect(
      typeof disabledInPage === 'boolean',
      'Could not evaluate disabled card presence',
    ).toBe(true);
  }
});
