const { test, expect } = require('@playwright/test');

test.describe('Pedalboard Planner: Multi-Board & Reparenting', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');

        // Create Board 1 (Aclam)
        await page.fill('#board-search', 'Aclam');
        await page.click('#board-list .list-item:has-text("Smart Track L2")');

        // Create Board 2 (Blackbird)
        await page.fill('#board-search', 'Blackbird');
        await page.click('#board-list .list-item:has-text("Tolex 1224")');

        // Drag Board 2 away so they don't overlap
        const board2 = page.locator('.placed-board').nth(1);
        await board2.hover();
        await page.mouse.down();
        await page.mouse.move(800, 200, { steps: 5 });
        await page.mouse.up();
    });

    test('Pedal drops onto the currently selected board by default', async ({ page }) => {
        // Select Board 1
        await page.locator('.placed-board').nth(0).click();

        // Add Pedal
        await page.focus('#pedal-search');
        await page.keyboard.type('boss ds1');
        await page.keyboard.press('Enter');

        // Verify pedal is visually inside Board 1's DOM element
        const board1 = page.locator('.placed-board').nth(0);
        const pedalInBoard1 = board1.locator('.pedal');
        await expect(pedalInBoard1).toHaveCount(1);
    });

    test('Pedal successfully reparents when dragged from Board 1 to Board 2', async ({ page }) => {
        // Select Board 1 and add pedal
        await page.locator('.placed-board').nth(0).click();
        await page.focus('#pedal-search');
        await page.keyboard.type('boss ds1');
        await page.keyboard.press('Enter');

        const pedal = page.locator('.pedal').first();
        const board2 = page.locator('.placed-board').nth(1);

        // Get center coordinates of Board 2
        const b2Box = await board2.boundingBox();
        const targetX = b2Box.x + (b2Box.width / 2);
        const targetY = b2Box.y + (b2Box.height / 2);

        // Drag pedal to Board 2
        await pedal.hover();
        await page.mouse.down();
        await page.mouse.move(targetX, targetY, { steps: 10 });
        await page.mouse.up();

        // Verify Board 1 has 0 pedals, Board 2 has 1 pedal
        const b1Pedals = page.locator('.placed-board').nth(0).locator('.pedal');
        const b2Pedals = page.locator('.placed-board').nth(1).locator('.pedal');

        await expect(b1Pedals).toHaveCount(0);
        await expect(b2Pedals).toHaveCount(1);
    });

    test('Pedal becomes "Boardless" when dragged onto the empty canvas', async ({ page }) => {
        // Select Board 1 and add pedal
        await page.locator('.placed-board').nth(0).click();
        await page.focus('#pedal-search');
        await page.keyboard.type('boss ds1');
        await page.keyboard.press('Enter');

        const pedal = page.locator('.pedal').first();

        // Drag pedal way off into the empty canvas space (e.g., top right corner)
        await pedal.hover();
        await page.mouse.down();
        await page.mouse.move(100, 100, { steps: 10 });
        await page.mouse.up();

        // Verify it is no longer inside Board 1's DOM
        const b1Pedals = page.locator('.placed-board').nth(0).locator('.pedal');
        await expect(b1Pedals).toHaveCount(0);

        // Verify it is now a direct child of the board-wrapper (boardless)
        const boardlessPedals = page.locator('#board-wrapper > .pedal');
        await expect(boardlessPedals).toHaveCount(1);
    });

    test('Sidebar hierarchy updates correctly when reparenting', async ({ page }) => {
        // Select Board 1 and add pedal
        await page.locator('.placed-board').nth(0).click();
        await page.focus('#pedal-search');
        await page.keyboard.type('boss ds1');
        await page.keyboard.press('Enter');

        // Sidebar should show it nested under Board 1 (first list item)
        let b1SidebarSubList = page.locator('.board-list-item').nth(0).locator('.pedal-sub-item');
        await expect(b1SidebarSubList).toHaveCount(1);
        await expect(b1SidebarSubList).toContainText('Boss DS-1');

        const pedal = page.locator('.pedal').first();
        const board2 = page.locator('.placed-board').nth(1);
        const b2Box = await board2.boundingBox();

        // Drag pedal to Board 2
        await pedal.hover();
        await page.mouse.down();
        await page.mouse.move(b2Box.x + 50, b2Box.y + 50, { steps: 10 });
        await page.mouse.up();

        // Sidebar should now show Board 1 empty, and Board 2 with the pedal
        b1SidebarSubList = page.locator('.board-list-item').nth(0).locator('.pedal-sub-item');
        let b2SidebarSubList = page.locator('.board-list-item').nth(1).locator('.pedal-sub-item');

        await expect(b1SidebarSubList).toHaveCount(0);
        await expect(b2SidebarSubList).toHaveCount(1);
    });

    test('Clicking empty canvas clears focus state', async ({ page }) => {
        // Select Board 1
        const board1 = page.locator('.placed-board').nth(0);
        await board1.click();

        // Verify Info Panel is visible
        const infoPanel = page.locator('#board-info-panel');
        await expect(infoPanel).toBeVisible();

        // Click the empty canvas container
        await page.locator('#canvas-container').click({ position: { x: 50, y: 50 } });

        // Verify Info Panel is hidden and outline is gone
        await expect(infoPanel).toBeHidden();
        const boxShadow = await board1.evaluate(el => el.style.boxShadow);
        expect(boxShadow).toBe('none');
    });

});
