const { test, expect } = require('@playwright/test');
const { gotoFresh, createCustomBoard, addPedalByTypeahead } = require('./helpers');

test.describe('Boards: custom, info panel, multi-board, removal', () => {
    test.beforeEach(async ({ page }) => { await gotoFresh(page); });

    test('custom board generates with cm × 10 scaling', async ({ page }) => {
        await createCustomBoard(page, 60, 30);
        const board = page.locator('.placed-board').last();
        await expect(board).toHaveCSS('width', '600px');
        await expect(board).toHaveCSS('height', '300px');
        await expect(board).toHaveClass(/custom-frame/);
    });

    test('Enter in custom-W jumps focus to custom-H, Enter in custom-H creates the board', async ({ page }) => {
        await page.fill('#custom-w', '50');
        await page.locator('#custom-w').press('Enter');
        const focusedId = await page.evaluate(() => document.activeElement.id);
        expect(focusedId).toBe('custom-h');

        await page.fill('#custom-h', '25');
        await page.locator('#custom-h').press('Enter');
        await expect(page.locator('.placed-board')).toHaveCount(1);
    });

    test('info panel reveals name, brand and cm dimensions when board selected', async ({ page }) => {
        await createCustomBoard(page, 60, 30);
        await page.locator('.placed-board').first().click();
        await expect(page.locator('#board-info-panel')).toBeVisible();
        await expect(page.locator('#info-name')).toContainText('60');
        await expect(page.locator('#info-size')).toContainText('60.0 × 30.0 cm');
        await expect(page.locator('#info-brand')).toContainText('Custom');
    });

    test('multiple boards are direct children of #board-wrapper', async ({ page }) => {
        await createCustomBoard(page, 40, 20);
        await createCustomBoard(page, 30, 15);
        const count = await page.locator('#board-wrapper > .placed-board').count();
        expect(count).toBe(2);
    });

    test('clear-pedals-on-board wipes only that board', async ({ page }) => {
        await createCustomBoard(page, 60, 30);
        await page.locator('.placed-board').first().click();
        await addPedalByTypeahead(page, 'boss ds1');
        await expect(page.locator('.placed-board .pedal')).toHaveCount(1);

        await page.click('#clear-selected-board-btn');
        await expect(page.locator('.placed-board .pedal')).toHaveCount(0);
    });

    test('sidebar X removes a placed board entirely', async ({ page }) => {
        await createCustomBoard(page, 60, 30);
        await addPedalByTypeahead(page, 'boss ds1');
        await expect(page.locator('.placed-board')).toHaveCount(1);
        await expect(page.locator('.pedal')).toHaveCount(1);

        await page.locator('#on-canvas-list .board-list-item .remove-btn').first().click();
        await expect(page.locator('.placed-board')).toHaveCount(0);
        await expect(page.locator('.pedal')).toHaveCount(0);
    });

    test('selected board gets the focused outline class', async ({ page }) => {
        await createCustomBoard(page, 60, 30);
        await page.locator('.placed-board').first().click();
        await expect(page.locator('.placed-board').first()).toHaveClass(/focused/);
    });
});
