const { test, expect } = require('@playwright/test');

test.describe('Pedalboard Planner V8', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the app before each test
    await page.goto('/');
    // Always create a board before pedal actions
    await page.fill('#custom-w', '60');
    await page.fill('#custom-h', '30');
    await page.click('#custom-board-btn');
  });

  test('REQ-3.2: Custom Board Generation', async ({ page }) => {
    // Enter custom dimensions
    await page.fill('#custom-w', '60'); // 60cm
    await page.fill('#custom-h', '30'); // 30cm
    await page.click('#custom-board-btn');

    // Verify the board size scaled correctly (1cm = 10px)
    const board = page.locator('#board');
    await expect(board).toHaveCSS('width', '600px');
    await expect(board).toHaveCSS('height', '300px');
    
    // Verify it updated the search bar
    await expect(page.locator('#board-search')).toHaveValue('Custom (60x30 cm)');
  });

  test('REQ-4.2 & REQ-4.3: Fuzzy Search and Keyboard Add', async ({ page }) => {
    // Click the input and type a fuzzy search
    await page.focus('#pedal-search');
    await page.keyboard.type('boss ds1');
    // Wait for pedal list to populate
    const listItems = page.locator('#pedal-list .list-item:visible');
    expect(await listItems.count()).toBeGreaterThan(0);
    await expect(listItems.first()).toContainText(/Boss.*DS-1/i);
    // Press enter to add the auto-highlighted item
    await page.keyboard.press('Enter');
    // Verify pedal is on the board
    const pedals = page.locator('.pedal');
    await expect(pedals).toHaveCount(1);
  });

  test('REQ-6.3: Double Click to Delete', async ({ page }) => {
    // Add a pedal via the UI
    await page.focus('#pedal-search');
    await page.keyboard.type('boss ds1');
    await page.keyboard.press('Enter');
    const pedal = page.locator('.pedal').first();
    await expect(pedal).toBeVisible();
    // Double click to remove
    await pedal.dblclick();
    // Verify it's gone
    await expect(page.locator('.pedal')).toHaveCount(0);
  });

  test('REQ-2.5: Clear Board Button', async ({ page }) => {
    // Add two pedals (search and add, then search and add again)
    await page.focus('#pedal-search');
    await page.keyboard.type('boss ds1');
    await page.keyboard.press('Enter');
    // Clear search and add again
    await page.fill('#pedal-search', '');
    await page.keyboard.type('boss ds1');
    await page.keyboard.press('Enter');
    await expect(page.locator('.pedal')).toHaveCount(2);
    // Nuke it
    await page.click('#clear-board-btn');

    // Verify emptiness
    await expect(page.locator('.pedal')).toHaveCount(0);
  });


});
