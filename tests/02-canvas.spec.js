const { test, expect } = require('@playwright/test');
const { gotoFresh, createCustomBoard, addPedalByTypeahead, getTransform } = require('./helpers');

test.describe('Canvas: pan, zoom, fit-to-screen', () => {
    test.beforeEach(async ({ page }) => {
        await gotoFresh(page);
        await createCustomBoard(page, 60, 30);
    });

    test('mouse wheel zooms the workspace (clamped)', async ({ page }) => {
        const before = await getTransform(page);
        const container = page.locator('#canvas-container');
        for (let i = 0; i < 20; i++) {
            await container.dispatchEvent('wheel', { deltaY: -100, deltaMode: 0 });
        }
        const after = await getTransform(page);
        expect(after).not.toEqual(before);

        // Zoom-out hard to test clamp
        for (let i = 0; i < 200; i++) {
            await container.dispatchEvent('wheel', { deltaY: 100, deltaMode: 0 });
        }
        const readout = await page.locator('#zoom-readout').textContent();
        const pct = parseInt(readout, 10);
        expect(pct).toBeGreaterThanOrEqual(20);   // ZOOM_MIN 0.2
        expect(pct).toBeLessThanOrEqual(400);     // ZOOM_MAX 4.0
    });

    test('zoom readout reflects current zoom', async ({ page }) => {
        const initial = await page.locator('#zoom-readout').textContent();
        await page.locator('#canvas-container').dispatchEvent('wheel', { deltaY: -240, deltaMode: 0 });
        const updated = await page.locator('#zoom-readout').textContent();
        expect(initial).not.toEqual(updated);
        expect(updated).toMatch(/%$/);
    });

    test('clicking empty canvas clears board selection', async ({ page }) => {
        await page.locator('.placed-board').first().click();
        await expect(page.locator('#board-info-panel')).toBeVisible();
        // click far away in empty workspace
        await page.locator('#canvas-container').click({ position: { x: 50, y: 50 } });
        await expect(page.locator('#board-info-panel')).toBeHidden();
    });

    test('fit-to-screen recenters and rescales', async ({ page }) => {
        // jiggle viewport
        for (let i = 0; i < 10; i++) {
            await page.locator('#canvas-container').dispatchEvent('wheel', { deltaY: -100 });
        }
        const before = await getTransform(page);
        await page.click('#fit-to-screen-btn');
        const after = await getTransform(page);
        expect(after).not.toEqual(before);
    });

    test('F hotkey triggers fit-to-screen', async ({ page }) => {
        for (let i = 0; i < 5; i++) {
            await page.locator('#canvas-container').dispatchEvent('wheel', { deltaY: -100 });
        }
        const before = await getTransform(page);
        await page.locator('body').click({ position: { x: 600, y: 400 } });
        await page.keyboard.press('f');
        const after = await getTransform(page);
        expect(after).not.toEqual(before);
    });

    test('background shade selector switches and persists', async ({ page }) => {
        const swatches = page.locator('.sidebar-footer .bg-shade');
        const count = await swatches.count();
        expect(count).toBeGreaterThan(1);
        // pick the last shade (lightest)
        await swatches.nth(count - 1).click();
        const newBg = await page.locator('#canvas-container').evaluate(el =>
            el.style.backgroundColor);
        expect(newBg).not.toBe('rgb(24, 25, 27)');
        await page.reload();
        const restored = await page.locator('#canvas-container').evaluate(el =>
            el.style.backgroundColor);
        expect(restored).toBe(newBg);
    });
});
