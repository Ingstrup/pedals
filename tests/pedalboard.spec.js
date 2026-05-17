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

  test('Export structure nests pedals under board and includes positions', async ({ page, context }) => {
    // Add a pedal
    await page.focus('#pedal-search');
    await page.keyboard.type('boss ds1');
    await page.keyboard.press('Enter');
    const pedal = page.locator('.pedal').first();
    await expect(pedal).toBeVisible();
    // Move pedal to a known position
    const { x, y } = await pedal.boundingBox();
    await pedal.hover();
    await page.mouse.down();
    await page.mouse.move(x + 50, y + 30);
    await page.mouse.up();
    // Export JSON
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#export-json-btn'),
    ]);
    const path = await download.path();
    const fs = require('fs');
    const data = fs.readFileSync(path, 'utf8');
    const obj = JSON.parse(data);
    // Structure checks
    expect(obj.board).toBeDefined();
    expect(Array.isArray(obj.board.pedals)).toBeTruthy();
    expect(obj.board.pedals.length).toBeGreaterThan(0);
    expect(obj.board.pedals[0].x).toBeDefined();
    expect(obj.board.pedals[0].y).toBeDefined();
    expect(obj.placedPedals).toBeUndefined();
  });

  test('Pedal position is restored after import', async ({ page }) => {
    // Add a pedal and move it
    await page.focus('#pedal-search');
    await page.keyboard.type('boss ds1');
    await page.keyboard.press('Enter');
    const pedal = page.locator('.pedal').first();
    await expect(pedal).toBeVisible();
    // Move pedal to a known position
    const { x, y } = await pedal.boundingBox();
    await pedal.hover();
    await page.mouse.down();
    await page.mouse.move(x + 80, y + 40);
    await page.mouse.up();
    // Get logical position (style.left/top)
    const leftBefore = await pedal.evaluate(el => parseFloat(el.style.left));
    const topBefore = await pedal.evaluate(el => parseFloat(el.style.top));
    // Export JSON
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#export-json-btn'),
    ]);
    const path = await download.path();
    // Clear board
    await page.click('#clear-board-btn');
    await expect(page.locator('.pedal')).toHaveCount(0);
    // Import JSON
    const importInput = await page.$('#import-json-input');
    await importInput.setInputFiles(path);
    // Wait for pedal to reappear
    const pedalAfter = page.locator('.pedal').first();
    await expect(pedalAfter).toBeVisible();
    // Get logical position after import
    const leftAfter = await pedalAfter.evaluate(el => parseFloat(el.style.left));
    const topAfter = await pedalAfter.evaluate(el => parseFloat(el.style.top));
    // Should be the same (allowing for rounding)
    expect(Math.abs(leftAfter - leftBefore)).toBeLessThanOrEqual(2);
    expect(Math.abs(topAfter - topBefore)).toBeLessThanOrEqual(2);
  });

  test('Sidebar X removes pedal', async ({ page }) => {
    // Add a pedal
    await page.focus('#pedal-search');
    await page.keyboard.type('boss ds1');
    await page.keyboard.press('Enter');
    await expect(page.locator('.pedal')).toHaveCount(1);
    // Find the X button in the sidebar and click it
    const xBtn = page.locator('#placed-pedals-list .remove-btn').first();
    await xBtn.click();
    // Pedal should be removed
    await expect(page.locator('.pedal')).toHaveCount(0);
  });

  test('Sidebar lists all placed boards as top-level items in On Canvas section', async ({ page }) => {
    // Place two different boards
    await page.fill('#board-search', 'Aclam');
    await page.click('#board-list .list-item:has-text("Smart Track L2 (Free)")');
    // Add a pedal to this board so it counts as placed
    await page.focus('#pedal-search');
    await page.keyboard.type('boss ds1');
    await page.keyboard.press('Enter');

    // Add a second board
    await page.fill('#board-search', 'Blackbird');
    await page.click('#board-list .list-item:has-text("Tolex 1224")');
    // Add a pedal to this board as well
    await page.focus('#pedal-search');
    await page.keyboard.type('boss ds1');
    await page.keyboard.press('Enter');

    // Now check the sidebar for both boards as top-level items
    // (Assume new sidebar section will have id #on-canvas-list)
    const boardItems = await page.locator('#on-canvas-list .board-list-item').allTextContents();
    expect(boardItems.some(t => /Aclam.*Smart Track L2/.test(t))).toBeTruthy();
    expect(boardItems.some(t => /Blackbird.*Tolex 1224/.test(t))).toBeTruthy();
  });

});
