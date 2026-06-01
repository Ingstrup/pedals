const { test, expect } = require('@playwright/test');
const { gotoFresh } = require('./helpers');

// Portrait bottom-sheet starts collapsed; open it to reach the catalog.
async function openSheet(page) {
    await page.evaluate(() => document.getElementById('sidebar').classList.add('open'));
}

async function addBoardAndPedal(page) {
    await openSheet(page);
    await page.fill('#custom-w', '60');
    await page.fill('#custom-h', '30');
    await page.tap('#custom-board-btn');
    await expect(page.locator('.placed-board')).toHaveCount(1);

    await openSheet(page);
    await page.fill('#pedal-search', 'boss ds1');
    await page.locator('#pedal-list .list-item').first().waitFor();
    await page.tap('#pedal-list .list-item');
    await expect(page.locator('.pedal')).toHaveCount(1);
}

test.describe('Mobile — touch builder', () => {
    test.beforeEach(async ({ page }) => { await gotoFresh(page); });

    test('bottom sheet starts collapsed and the handle toggles it', async ({ page }) => {
        const sidebar = page.locator('#sidebar');
        await expect(sidebar).not.toHaveClass(/open/);
        await page.tap('#sheet-handle');
        await expect(sidebar).toHaveClass(/\bopen\b/);
        await page.tap('#sheet-handle');
        await expect(sidebar).not.toHaveClass(/\bopen\b/);
    });

    test('canvas shade selector is reachable in the sheet and changes the bg', async ({ page }) => {
        await openSheet(page);
        const host = page.locator('.shade-row .bg-shade-host');
        await expect(host).toBeVisible();
        const swatches = host.locator('.bg-shade');
        await expect(swatches).toHaveCount(5);
        // pick the lightest shade → canvas background changes
        await swatches.last().scrollIntoViewIfNeeded();
        await swatches.last().tap();
        const bg = await page.locator('#canvas-container').evaluate(el => getComputedStyle(el).backgroundColor);
        expect(bg).toBe('rgb(237, 237, 237)'); // #ededed
    });

    test('catalog rows show thumbnails and a tap adds the pedal', async ({ page }) => {
        await openSheet(page);
        await page.fill('#pedal-search', 'boss ds1');
        const firstRow = page.locator('#pedal-list .list-item').first();
        await firstRow.waitFor();
        await expect(firstRow.locator('img.list-thumb')).toHaveCount(1);
        await firstRow.tap();
        await expect(page.locator('.pedal')).toHaveCount(1);
    });

    test('results stay up after adding, so a second add needs no re-search', async ({ page }) => {
        await openSheet(page);
        await page.fill('#pedal-search', 'boss ds1');
        await page.locator('#pedal-list .list-item').first().waitFor();
        await page.tap('#pedal-list .list-item');
        await expect(page.locator('.pedal')).toHaveCount(1);
        // List is still open (no need to refocus the input / re-pop the keyboard)
        await expect(page.locator('#pedal-list')).toHaveClass(/active/);
        await page.tap('#pedal-list .list-item');
        await expect(page.locator('.pedal')).toHaveCount(2);
    });

    test('one-finger drag moves a pedal', async ({ page }) => {
        await addBoardAndPedal(page);
        const result = await page.evaluate(async () => {
            const { state } = await import('/src/state.js');
            const pos = () => {
                for (const b of state.placedBoards) if (b.pedals[0]) return { x: b.pedals[0].x, y: b.pedals[0].y };
                if (state.canvasPedals[0]) return { x: state.canvasPedals[0].x, y: state.canvasPedals[0].y };
                return null;
            };
            const el = document.querySelector('.pedal');
            const r = el.getBoundingClientRect();
            const sx = r.left + r.width / 2, sy = r.top + r.height / 2;
            const before = pos();
            el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: sx, clientY: sy, button: 0, bubbles: true }));
            document.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: sx + 120, clientY: sy + 60, bubbles: true }));
            document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: sx + 120, clientY: sy + 60, bubbles: true }));
            return { before, after: pos() };
        });
        const moved = Math.abs(result.after.x - result.before.x) + Math.abs(result.after.y - result.before.y);
        expect(moved).toBeGreaterThan(10);
    });

    test('selecting a pedal reveals the action bar; rotate and delete work', async ({ page }) => {
        await addBoardAndPedal(page);
        await page.evaluate(() => document.getElementById('sidebar').classList.remove('open'));
        const pedal = page.locator('.pedal').first();
        await pedal.tap();

        const bar = page.locator('#touch-actions');
        await expect(bar).toBeVisible();

        await bar.getByRole('button', { name: /Rotate/ }).tap();
        await expect(pedal).toHaveAttribute('style', /rotate\(90deg\)/);

        await bar.getByRole('button', { name: /Delete/ }).tap();
        await expect(page.locator('.pedal')).toHaveCount(0);
        // Pedal-specific actions are gone (the board stays selected, so the bar
        // switches to board actions rather than disappearing).
        await expect(bar.getByRole('button', { name: /Rotate/ })).toHaveCount(0);
    });

    test('pinch spreads zoom in; one finger pans', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const { state } = await import('/src/state.js');
            const c = document.getElementById('canvas-container');
            const r = c.getBoundingClientRect();
            const mx = r.left + r.width / 2, my = r.top + r.height / 2;
            const pd = (id, x, y) => c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, clientX: x, clientY: y, button: 0, bubbles: true }));
            const pm = (id, x, y) => c.dispatchEvent(new PointerEvent('pointermove', { pointerId: id, clientX: x, clientY: y, bubbles: true }));
            const pu = (id, x, y) => c.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, clientX: x, clientY: y, bubbles: true }));

            // --- pinch out ---
            const zoomBefore = state.zoom;
            pd(1, mx - 50, my); pd(2, mx + 50, my);
            pm(1, mx - 150, my); pm(2, mx + 150, my);
            pu(1, mx - 150, my); pu(2, mx + 150, my);
            const zoomAfter = state.zoom;

            // --- one-finger pan ---
            const panBefore = state.panX;
            pd(3, mx, my); pm(3, mx + 100, my); pu(3, mx + 100, my);
            const panAfter = state.panX;

            return { zoomBefore, zoomAfter, panBefore, panAfter };
        });
        expect(result.zoomAfter).toBeGreaterThan(result.zoomBefore);
        expect(result.panAfter - result.panBefore).toBeCloseTo(100, 0);
    });
});
