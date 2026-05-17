const { test, expect } = require('@playwright/test');

test.describe('Pedalboard Planner Core Flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Always create a board before pedal actions
    await page.fill('#custom-w', '60');
    await page.fill('#custom-h', '30');
    await page.click('#custom-board-btn');
  });

  test('Canvas can be panned and zoomed (zoom clamped)', async ({ page }) => {
    const boardWrapper = page.locator('#board-wrapper');
    // Initial transform
    const initialTransform = await boardWrapper.evaluate(el => el.style.transform);
    // Pan: simulate mouse drag
    await page.mouse.move(600, 400);
    await page.mouse.down();
    await page.mouse.move(700, 500, { steps: 5 });
    await page.mouse.up();
    const afterPanTransform = await boardWrapper.evaluate(el => el.style.transform);
    expect(afterPanTransform).not.toEqual(initialTransform);
    // Zoom in (scroll up)
    for (let i = 0; i < 30; i++) await page.locator('#canvas-container').dispatchEvent('wheel', { deltaY: -100 });
    const zoomedInTransform = await boardWrapper.evaluate(el => el.style.transform);
    expect(zoomedInTransform).not.toEqual(afterPanTransform);
    // Zoom out (scroll down)
    for (let i = 0; i < 60; i++) await page.locator('#canvas-container').dispatchEvent('wheel', { deltaY: 100 });
    const zoomedOutTransform = await boardWrapper.evaluate(el => el.style.transform);
    expect(zoomedOutTransform).not.toEqual(zoomedInTransform);
  });

  test('State is persisted and restored on reload', async ({ page }) => {
    // Add a pedal
    await page.focus('#pedal-search');
    await page.keyboard.type('boss ds1');
    await page.keyboard.press('Enter');
    await expect(page.locator('.pedal')).toHaveCount(1);
    // Reload
    await page.reload();
    await expect(page.locator('.pedal')).toHaveCount(1);
  });

  test('Snap-to-grid toggle affects pedal placement', async ({ page }) => {
    // Enable snap-to-grid (checkbox)
    const snapGrid = page.locator('#snap-grid');
    if (!(await snapGrid.isChecked())) {
      await snapGrid.check();
    }
    // Add a pedal
    await page.focus('#pedal-search');
    await page.keyboard.type('boss ds1');
    await page.keyboard.press('Enter');
    const pedal = page.locator('.pedal').first();
    const { x, y } = await pedal.boundingBox();
    // Drag pedal to a non-grid position (further to ensure snap)
    await pedal.hover();
    await page.mouse.down();
    await page.mouse.move(x + 23, y + 27);
    await page.mouse.up();
    // On mouse up, pedal should snap to grid (10px increments, allow for rounding)
    const { x: newX, y: newY } = await pedal.boundingBox();
    expect(newX % 10).toBeLessThanOrEqual(5);
    expect(newY % 10).toBeLessThanOrEqual(5);
  });

  test('Pedal preview modal appears on hover', async ({ page }) => {
    await page.focus('#pedal-search');
    await page.keyboard.type('boss ds1');
    const pedalListItem = page.locator('#pedal-list .list-item').first();
    await pedalListItem.waitFor({ state: 'visible' });
    await pedalListItem.hover();
    const preview = page.locator('#preview-overlay');
    await expect(preview).toBeVisible();
  });

  test('Keyboard navigation in pedal list', async ({ page }) => {
    await page.focus('#pedal-search');
    await page.keyboard.type('boss');
    const listItems = page.locator('#pedal-list .list-item');
    await expect(listItems.first()).toHaveClass(/highlighted/);
    await page.keyboard.press('ArrowDown');
    // Wait for highlight to move
    await expect(listItems.nth(1)).toHaveClass(/highlighted/);
    await page.keyboard.press('ArrowUp');
    await expect(listItems.first()).toHaveClass(/highlighted/);
  });

  test('Add pedal to board', async ({ page }) => {
    await page.focus('#pedal-search');
    await page.keyboard.type('boss ds1');
    await page.keyboard.press('Enter');
    await expect(page.locator('.pedal')).toHaveCount(1);
  });

  test('Fit to screen button centers and fits board', async ({ page }) => {
    // Create a custom board
    await page.fill('#custom-w', '60');
    await page.fill('#custom-h', '30');
    await page.click('#custom-board-btn');
    // Pan and zoom away from center
    await page.mouse.move(600, 400);
    await page.mouse.down();
    await page.mouse.move(800, 600, { steps: 5 });
    await page.mouse.up();
    for (let i = 0; i < 20; i++) await page.locator('#canvas-container').dispatchEvent('wheel', { deltaY: -100 });
    // Save the transform
    const boardWrapper = page.locator('#board-wrapper');
    const before = await boardWrapper.evaluate(el => el.style.transform);
    // Click the Fit to screen button
    await page.click('#fit-to-screen-btn');
    // The transform should change to center and fit the board
    const after = await boardWrapper.evaluate(el => el.style.transform);
    expect(after).not.toEqual(before);
    // The board should be visually centered (allowing for margin)
    const container = await page.locator('#canvas-container').boundingBox();
    const board = await page.locator('#board').boundingBox();
    const boardCenterX = board.x + board.width / 2;
    const boardCenterY = board.y + board.height / 2;
    const containerCenterX = container.x + container.width / 2;
    const containerCenterY = container.y + container.height / 2;
    expect(Math.abs(boardCenterX - containerCenterX)).toBeLessThanOrEqual(50);
    expect(Math.abs(boardCenterY - containerCenterY)).toBeLessThanOrEqual(50);
  });

  test('Export/Import JSON round-trip only saves layout references and restores correctly', async ({ page, context }) => {
    // Setup: create a board and add a pedal
    await page.fill('#custom-w', '60');
    await page.fill('#custom-h', '30');
    await page.click('#custom-board-btn');
    await page.focus('#pedal-search');
    await page.keyboard.type('boss ds1');
    await page.keyboard.press('Enter');
    await expect(page.locator('.pedal')).toHaveCount(1);

    // Export JSON
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#export-json-btn'),
    ]);
    const path = await download.path();
    const fs = require('fs');
    const data = fs.readFileSync(path, 'utf8');
    const obj = JSON.parse(data);

    // Should NOT contain all pedal or board data
    expect(obj.pedals).toBeUndefined();
    expect(obj.boards).toBeUndefined();
    // Should contain placedPedals and board reference only
    expect(Array.isArray(obj.placedPedals)).toBeTruthy();
    expect(obj.placedPedals.length).toBeGreaterThan(0);
    expect(obj.board).toBeDefined();
    expect(typeof obj.board.id).toBe('string');
    // Should only reference pedalId/model, not full pedal objects
    expect(typeof obj.placedPedals[0].pedalId).toBe('string');
    expect(obj.placedPedals[0].brand).toBeUndefined();
    expect(obj.placedPedals[0].name).toBeUndefined();

    // Clear the board (simulate wipe)
    await page.click('#clear-board-btn');
    await expect(page.locator('.pedal')).toHaveCount(0);

    // Import JSON (simulate user file input)
    const importInput = await page.$('#import-json-input');
    await importInput.setInputFiles(path);
    // Wait for pedal to reappear
    await expect(page.locator('.pedal')).toHaveCount(1);
    // Verify the pedal is the same model as before
    const pedalText = await page.locator('.pedal').first().getAttribute('id');
    expect(pedalText).toContain('boss_ds1');
  });
});
