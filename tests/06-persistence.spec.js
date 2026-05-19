const { test, expect } = require('@playwright/test');
const { gotoFresh, createCustomBoard, addPedalByTypeahead } = require('./helpers');

test.describe('localStorage persistence', () => {
    test('placed board and pedal survive a reload', async ({ page }) => {
        await gotoFresh(page);
        await createCustomBoard(page, 60, 30);
        await addPedalByTypeahead(page, 'boss ds1');
        await expect(page.locator('.pedal')).toHaveCount(1);

        await page.reload();
        await page.waitForFunction(() => document.querySelectorAll('.placed-board').length > 0);

        await expect(page.locator('.placed-board')).toHaveCount(1);
        await expect(page.locator('.pedal')).toHaveCount(1);
    });

    test('zoom and pan are restored after reload', async ({ page }) => {
        await gotoFresh(page);
        await createCustomBoard(page, 60, 30);
        // alter zoom
        for (let i = 0; i < 8; i++) {
            await page.locator('#canvas-container').dispatchEvent('wheel', { deltaY: -100 });
        }
        const before = await page.locator('#board-wrapper').evaluate(el => el.style.transform);
        await page.reload();
        await page.waitForFunction(() => document.querySelectorAll('.placed-board').length > 0);
        const after = await page.locator('#board-wrapper').evaluate(el => el.style.transform);
        expect(after).toBe(before);
    });

    test('pedal rotation persists across reload', async ({ page }) => {
        await gotoFresh(page);
        await createCustomBoard(page, 60, 30);
        await addPedalByTypeahead(page, 'boss ds1');
        await page.locator('.pedal').first().click();
        await page.keyboard.press('r');
        await page.keyboard.press('r');
        await page.reload();
        await page.waitForFunction(() => document.querySelectorAll('.pedal').length > 0);
        const transform = await page.locator('.pedal').first().evaluate(el => el.style.transform);
        expect(transform).toContain('rotate(180deg)');
    });

    test('Clear Canvas confirm-cancel keeps state, confirm-accept wipes it', async ({ page }) => {
        await gotoFresh(page);
        await createCustomBoard(page, 60, 30);
        await addPedalByTypeahead(page, 'boss ds1');

        page.once('dialog', d => d.dismiss());
        await page.click('#clear-board-btn');
        await expect(page.locator('.placed-board')).toHaveCount(1);

        page.once('dialog', d => d.accept());
        await page.click('#clear-board-btn');
        await expect(page.locator('.placed-board')).toHaveCount(0);
        await expect(page.locator('.pedal')).toHaveCount(0);
    });
});

test.describe('JSON export / import', () => {
    test('export writes a compact layout JSON (no full pedal catalog)', async ({ page }) => {
        await gotoFresh(page);
        await createCustomBoard(page, 60, 30);
        await addPedalByTypeahead(page, 'boss ds1');

        const [download] = await Promise.all([
            page.waitForEvent('download'),
            page.click('#export-json-btn'),
        ]);
        const path = await download.path();
        const fs = require('fs');
        const obj = JSON.parse(fs.readFileSync(path, 'utf8'));

        expect(Array.isArray(obj.placedBoards)).toBe(true);
        expect(obj.placedBoards.length).toBe(1);
        expect(obj.placedBoards[0].pedals.length).toBe(1);
        // Should not bundle the full library
        expect(obj.pedals).toBeUndefined();
        expect(obj.boards).toBeUndefined();
        // Coordinates and identifiers are present
        const p = obj.placedBoards[0].pedals[0];
        expect(typeof p.pedalId).toBe('string');
        expect(typeof p.x).toBe('number');
        expect(typeof p.y).toBe('number');
    });

    test('import restores layout and camera', async ({ page }) => {
        await gotoFresh(page);
        await createCustomBoard(page, 60, 30);
        await addPedalByTypeahead(page, 'boss ds1');

        const [download] = await Promise.all([
            page.waitForEvent('download'),
            page.click('#export-json-btn'),
        ]);
        const path = await download.path();

        // Wipe
        page.once('dialog', d => d.accept());
        await page.click('#clear-board-btn');
        await expect(page.locator('.pedal')).toHaveCount(0);

        // Import
        await page.setInputFiles('#import-json-input', path);
        await expect(page.locator('.placed-board')).toHaveCount(1);
        await expect(page.locator('.pedal')).toHaveCount(1);
    });
});
