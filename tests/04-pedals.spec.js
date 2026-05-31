const { test, expect } = require('@playwright/test');
const { gotoFresh, createCustomBoard, addPedalByTypeahead } = require('./helpers');

test.describe('Pedals: placement, drag, snap, rotate, delete', () => {
    test.beforeEach(async ({ page }) => {
        await gotoFresh(page);
        await createCustomBoard(page, 60, 30);
    });

    test('typing + Enter adds the auto-highlighted pedal', async ({ page }) => {
        await page.focus('#pedal-search');
        await page.keyboard.type('boss ds1');
        const first = page.locator('#pedal-list .list-item').first();
        await expect(first).toHaveClass(/highlighted/);
        await expect(first).toContainText(/Boss.*DS-1/i);
        await page.keyboard.press('Enter');
        await expect(page.locator('.pedal')).toHaveCount(1);
    });

    test('snap-to-grid lands the pedal on a 10-px multiple', async ({ page }) => {
        await expect(page.locator('#snap-grid')).toBeChecked();
        await addPedalByTypeahead(page, 'boss ds1');
        const pedal = page.locator('.pedal').first();

        // Drag pedal by an off-grid amount; it must snap on mouseup.
        const box = await pedal.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 47, box.y + 33, { steps: 6 });
        await page.mouse.up();

        const left = await pedal.evaluate(el => parseFloat(el.style.left));
        const top = await pedal.evaluate(el => parseFloat(el.style.top));
        expect(left % 10).toBeCloseTo(0, 5);
        expect(top % 10).toBeCloseTo(0, 5);
    });

    test('snap OFF preserves arbitrary coordinates', async ({ page }) => {
        await page.uncheck('#snap-grid');
        await addPedalByTypeahead(page, 'boss ds1');
        const pedal = page.locator('.pedal').first();

        const box = await pedal.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 53, box.y + 41, { steps: 6 });
        await page.mouse.up();

        const left = await pedal.evaluate(el => parseFloat(el.style.left));
        const top = await pedal.evaluate(el => parseFloat(el.style.top));
        // With snap off, hitting an exact 10-multiple is statistically unlikely
        const offGrid = (left % 10 !== 0) || (top % 10 !== 0);
        expect(offGrid).toBeTruthy();
    });

    test('R rotates the focused pedal 90°', async ({ page }) => {
        await addPedalByTypeahead(page, 'boss ds1');
        const pedal = page.locator('.pedal').first();
        await pedal.click();
        await page.keyboard.press('r');
        const transform = await pedal.evaluate(el => el.style.transform);
        expect(transform).toContain('rotate(90deg)');
    });

    test('Delete hotkey removes the focused pedal', async ({ page }) => {
        await addPedalByTypeahead(page, 'boss ds1');
        await page.locator('.pedal').first().click();
        await page.keyboard.press('Delete');
        await expect(page.locator('.pedal')).toHaveCount(0);
    });

    test('mousedown raises z-index above siblings', async ({ page }) => {
        await addPedalByTypeahead(page, 'boss ds1');
        await page.fill('#pedal-search', '');
        await addPedalByTypeahead(page, 'boss ds1');
        await expect(page.locator('.pedal')).toHaveCount(2);

        // Drag pedal #2 apart so they don't occlude each other.
        const p2 = page.locator('.pedal').nth(1);
        const box2 = await p2.boundingBox();
        await page.mouse.move(box2.x + 5, box2.y + 5);
        await page.mouse.down();
        await page.mouse.move(box2.x + 200, box2.y + 100, { steps: 8 });
        await page.mouse.up();

        const pedals = page.locator('.pedal');
        await pedals.first().click();
        const z1 = await pedals.first().evaluate(el => parseInt(el.style.zIndex, 10));
        await pedals.nth(1).click();
        const z2 = await pedals.nth(1).evaluate(el => parseInt(el.style.zIndex, 10));
        expect(z2).toBeGreaterThan(z1);
    });

    test('sidebar X removes a single pedal', async ({ page }) => {
        await addPedalByTypeahead(page, 'boss ds1');
        await expect(page.locator('.pedal')).toHaveCount(1);
        await page.locator('#on-canvas-list .pedal-sub-item .remove-btn').first().click();
        await expect(page.locator('.pedal')).toHaveCount(0);
    });

    test('On-canvas count badge updates on add/remove', async ({ page }) => {
        await expect(page.locator('#pedal-count')).toHaveText('0');
        await addPedalByTypeahead(page, 'boss ds1');
        await expect(page.locator('#pedal-count')).toHaveText('1');
        await page.fill('#pedal-search', '');
        await addPedalByTypeahead(page, 'boss ds1');
        await expect(page.locator('#pedal-count')).toHaveText('2');
        await page.locator('#on-canvas-list .pedal-sub-item .remove-btn').last().click();
        await expect(page.locator('#pedal-count')).toHaveText('1');
    });
});

test.describe('Multi-board pedal reparenting', () => {
    test.beforeEach(async ({ page }) => {
        await gotoFresh(page);
        // Build two non-overlapping boards.
        await page.fill('#custom-w', '40');
        await page.fill('#custom-h', '20');
        await page.click('#custom-board-btn');

        await page.fill('#custom-w', '40');
        await page.fill('#custom-h', '20');
        await page.click('#custom-board-btn');
        // Drag board 2 away from board 1
        const b2 = page.locator('.placed-board').nth(1);
        const b2box = await b2.boundingBox();
        await page.mouse.move(b2box.x + 4, b2box.y + 4);
        await page.mouse.down();
        await page.mouse.move(b2box.x + 500, b2box.y + 200, { steps: 8 });
        await page.mouse.up();
    });

    test('new pedal lands on the currently-selected board', async ({ page }) => {
        const b1 = page.locator('.placed-board').nth(0);
        await b1.click();
        await addPedalByTypeahead(page, 'boss ds1');
        await expect(b1.locator('.pedal')).toHaveCount(1);
    });

    test('dragging a pedal off all boards makes it boardless', async ({ page }) => {
        await page.locator('.placed-board').nth(0).click();
        await addPedalByTypeahead(page, 'boss ds1');
        const pedal = page.locator('.pedal').first();

        const box = await pedal.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(80, 80, { steps: 10 });
        await page.mouse.up();

        const boardlessCount = await page.locator('#board-wrapper > .pedal').count();
        expect(boardlessCount).toBeGreaterThanOrEqual(1);
        await expect(page.locator('#on-canvas-list')).toContainText('Boardless area');
    });
});
