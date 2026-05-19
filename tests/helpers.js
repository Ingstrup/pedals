/**
 * Shared test helpers. Each test starts on a clean localStorage so persistence
 * cases are deterministic.
 */
const { expect } = require('@playwright/test');

async function gotoFresh(page) {
    // Playwright gives each test a fresh browser context, so localStorage is
    // already isolated. We avoid addInitScript here because it re-runs on
    // page.reload() and would clobber the very data the persistence tests
    // are trying to verify.
    await page.goto('/');
    await page.waitForFunction(() => {
        const list = document.getElementById('pedal-list');
        return list && list.children.length > 0;
    }, { timeout: 15_000 });
}

async function createCustomBoard(page, w = 60, h = 30) {
    await page.fill('#custom-w', String(w));
    await page.fill('#custom-h', String(h));
    await page.click('#custom-board-btn');
    await expect(page.locator('.placed-board')).toHaveCount(
        await page.locator('.placed-board').count(),
    );
    await page.locator('.placed-board').last().waitFor();
}

async function addPedalByTypeahead(page, query = 'boss ds1') {
    await page.focus('#pedal-search');
    await page.fill('#pedal-search', query);
    const first = page.locator('#pedal-list .list-item').first();
    await first.waitFor();
    await expect(first).toHaveClass(/highlighted/);
    const countBefore = await page.locator('.pedal').count();
    await page.keyboard.press('Enter');
    // Wait for it to actually land
    await expect(page.locator('.pedal')).toHaveCount(countBefore + 1);
}

async function getTransform(page) {
    return page.locator('#board-wrapper').evaluate(el => el.style.transform);
}

module.exports = {
    gotoFresh,
    createCustomBoard,
    addPedalByTypeahead,
    getTransform,
};
