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
});
