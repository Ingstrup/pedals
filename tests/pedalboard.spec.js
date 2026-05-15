const { test, expect } = require('@playwright/test');

test.describe('Pedalboard Planner V8', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the app before each test
    await page.goto('/');
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
    await page.keyboard.type('boss ds1'); // Missing hyphen!

    // Verify the list filtered correctly
    const listItems = page.locator('#pedal-list .list-item:visible');
    await expect(listItems).toHaveCount(1);
    await expect(listItems.first()).toContainText('Boss - DS-1 Distortion');

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
    // Add two pedals
    await page.focus('#pedal-search');
    await page.keyboard.type('boss ds1');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter'); // Adds a second one

    await expect(page.locator('.pedal')).toHaveCount(2);

    // Nuke it
    await page.click('#clear-board-btn');

    // Verify emptiness
    await expect(page.locator('.pedal')).toHaveCount(0);
  });

  // ⚠️ THIS TEST WILL FAIL! (This is our TDD goal for the next fix)
  test('REQ-6.4: Smart Spawning (Offset Overlaps)', async ({ page }) => {
    // Add two of the same pedals
    await page.focus('#pedal-search');
    await page.keyboard.type('boss ds1');
    await page.keyboard.press('Enter');
    
    // Type again to get the list back, add a second one
    await page.focus('#pedal-search');
    await page.keyboard.type('boss ds1');
    await page.keyboard.press('Enter');

    const pedals = page.locator('.pedal');
    await expect(pedals).toHaveCount(2);

    // Get their X and Y coordinates on the screen
    const box1 = await pedals.nth(0).boundingBox();
    const box2 = await pedals.nth(1).boundingBox();

    // They should NOT be sitting in the exact same mathematical spot
    expect(box1.x).not.toEqual(box2.x);
    expect(box1.y).not.toEqual(box2.y);
  });

});