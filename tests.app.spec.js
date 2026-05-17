const { test, expect } = require('@playwright/test');

test.describe('Pedalboard Planner Core UI', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to local file or dev server (assuming dev server runs on port 8080)
    await page.goto('http://127.0.0.1:8080'); 
  });

  test('Page loads and elements exist', async ({ page }) => {
    await expect(page).toHaveTitle(/Pedalboard Planner/);
    await expect(page.locator('#canvas-container')).toBeVisible();
    await expect(page.locator('#pedal-search')).toBeVisible();
  });

  test('Fuzzy search and add pedal flow works', async ({ page }) => {
    const searchInput = page.locator('#pedal-search');
    await searchInput.fill('boss distortion'); // REQ-4.2 Unordered keywords check

    const resultList = page.locator('#search-results li.search-item');
    await expect(resultList.first()).toBeVisible();
    
    // Top result should auto-highlight
    await expect(resultList.first()).toHaveClass(/active-item/);

    // Keyboard enter to add
    await searchInput.press('Enter');

    // Canvas item check
    const canvasItems = page.locator('#workspace .canvas-item');
    await expect(canvasItems).toHaveCount(1);
  });
});