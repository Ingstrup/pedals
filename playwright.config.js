const { defineConfig, devices } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Clean results only in the main runner process — not in each parallel worker
// (workers re-require this config and would race on the same directory).
const resultsDir = path.join(__dirname, 'test-results');
if (!process.env.TEST_WORKER_INDEX && fs.existsSync(resultsDir)) {
    fs.rmSync(resultsDir, { recursive: true, force: true });
}

module.exports = defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    timeout: 30_000,
    expect: { timeout: 5_000 },
    reporter: [['list']],
    use: {
        baseURL: 'http://localhost:3000',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        viewport: { width: 1400, height: 900 },
    },
    webServer: {
        command: 'npm start',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
    },
    projects: [
        {
            name: 'chromium',
            testIgnore: '**/09-mobile.spec.js',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            // Mobile-emulated Chromium (390x844, touch) so we don't depend on
            // WebKit binaries being installed.
            name: 'mobile',
            testMatch: '**/09-mobile.spec.js',
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 390, height: 844 },
                hasTouch: true,
                isMobile: true,
            },
        },
    ],
});
