const { test, expect } = require('@playwright/test');
const { gotoFresh } = require('./helpers');

test.describe('Search list: fuzzy, keyboard, preview', () => {
    test.beforeEach(async ({ page }) => { await gotoFresh(page); });

    test('fuzzy match ignores hyphens and is case-insensitive', async ({ page }) => {
        await page.focus('#pedal-search');
        await page.keyboard.type('boss ds1');
        const first = page.locator('#pedal-list .list-item').first();
        await expect(first).toContainText(/Boss.*DS-1/i);
        await expect(first).toHaveClass(/highlighted/);
    });

    test('unordered keyword matching', async ({ page }) => {
        await page.focus('#pedal-search');
        await page.keyboard.type('distortion boss');
        const first = page.locator('#pedal-list .list-item').first();
        await expect(first).toContainText(/boss/i);
        await expect(first).toContainText(/distortion/i);
    });

    test('keyboard navigation moves highlight up/down', async ({ page }) => {
        await page.focus('#pedal-search');
        await page.keyboard.type('boss');
        const items = page.locator('#pedal-list .list-item');
        await expect(items.first()).toHaveClass(/highlighted/);
        await page.keyboard.press('ArrowDown');
        await expect(items.nth(1)).toHaveClass(/highlighted/);
        await page.keyboard.press('ArrowUp');
        await expect(items.first()).toHaveClass(/highlighted/);
    });

    test('mouse hover is suppressed while keyboard-navigating', async ({ page }) => {
        await page.focus('#pedal-search');
        await page.keyboard.type('boss');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');

        // Hover an entry several rows below; highlight should not jump to it
        // while kbd-nav is active.
        const items = page.locator('#pedal-list .list-item');
        await items.nth(5).hover({ trial: false });
        await expect(items.nth(2)).toHaveClass(/highlighted/);
    });

    test('Escape closes the list', async ({ page }) => {
        await page.focus('#pedal-search');
        await page.keyboard.type('boss');
        await expect(page.locator('#pedal-list')).toHaveClass(/active/);
        await page.keyboard.press('Escape');
        await expect(page.locator('#pedal-list')).not.toHaveClass(/active/);
    });

    test('list never exceeds 50 items initially (chunked rendering)', async ({ page }) => {
        await page.focus('#pedal-search');
        // empty query => full list, but only first chunk rendered
        const items = await page.locator('#pedal-list .list-item').count();
        expect(items).toBeLessThanOrEqual(50);
    });

    test('hover preview shows after debounce', async ({ page }) => {
        await page.focus('#pedal-search');
        await page.keyboard.type('boss ds1');
        await page.locator('#pedal-list .list-item').first().hover();
        // wait > debounce
        await page.waitForTimeout(200);
        await expect(page.locator('#preview-overlay')).not.toHaveClass(/hidden/);
        await expect(page.locator('#preview-image')).toBeVisible();
    });

    test('board preview includes dimensions in cm', async ({ page }) => {
        await page.focus('#board-search');
        await page.keyboard.type('aclam');
        await page.locator('#board-list .list-item').first().hover();
        await page.waitForTimeout(200);
        const dims = page.locator('#board-preview-dimensions');
        await expect(dims).toBeVisible();
        await expect(dims).toContainText(/×/);
    });

    test('search re-focusing keeps existing text and restores scroll', async ({ page }) => {
        await page.focus('#pedal-search');
        await page.keyboard.type('boss');
        await page.click('#canvas-container', { position: { x: 200, y: 200 } });
        const val = await page.locator('#pedal-search').inputValue();
        expect(val).toBe('boss');
        await page.focus('#pedal-search');
        await expect(page.locator('#pedal-list')).toHaveClass(/active/);
    });
});
