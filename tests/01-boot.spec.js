const { test, expect } = require('@playwright/test');
const { gotoFresh } = require('./helpers');

test.describe('Boot & basic chrome', () => {
    test.beforeEach(async ({ page }) => { await gotoFresh(page); });

    test('page title and key shells render', async ({ page }) => {
        await expect(page).toHaveTitle(/ThatPedalPlanner/);
        await expect(page.locator('#sidebar')).toBeVisible();
        await expect(page.locator('#canvas-container')).toBeVisible();
        await expect(page.locator('#board-search')).toBeVisible();
        await expect(page.locator('#pedal-search')).toBeVisible();
    });

    test('Bootstrap is loaded and dark theme is active', async ({ page }) => {
        const theme = await page.locator('html').getAttribute('data-bs-theme');
        expect(theme).toBe('dark');
        const hasBootstrap = await page.evaluate(() => {
            return Array.from(document.styleSheets).some(s =>
                (s.href || '').includes('bootstrap'));
        });
        expect(hasBootstrap).toBeTruthy();
    });

    test('canvas starts at darkest shade by default', async ({ page }) => {
        const bg = await page.locator('#canvas-container').evaluate(el =>
            getComputedStyle(el).backgroundColor);
        // #18191b ⇒ rgb(24, 25, 27)
        expect(bg).toBe('rgb(24, 25, 27)');
        // Shades render into every host (desktop footer + mobile sheet); each
        // marks exactly one selected swatch.
        const selected = page.locator('#bg-shade-selector .bg-shade.selected');
        await expect(selected).toHaveCount(1);
    });

    test('boards and pedals data are loaded into the lists', async ({ page }) => {
        const boardItems = await page.locator('#board-list .list-item').count();
        const pedalItems = await page.locator('#pedal-list .list-item').count();
        expect(boardItems).toBeGreaterThan(0);
        expect(pedalItems).toBeGreaterThan(0);
    });

    test('no board labels render under boards', async ({ page }) => {
        await page.fill('#custom-w', '60');
        await page.fill('#custom-h', '30');
        await page.click('#custom-board-btn');
        await expect(page.locator('.placed-board')).toHaveCount(1);
        // Old label element used .board-label; ensure none exist now.
        await expect(page.locator('.placed-board .board-label')).toHaveCount(0);
    });
});
