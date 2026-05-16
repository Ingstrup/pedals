const { defineConfig, devices } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Clean test-results before each run
const resultsDir = path.join(__dirname, 'test-results');
if (fs.existsSync(resultsDir)) {
  fs.rmSync(resultsDir, { recursive: true, force: true });
}

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:3000',
  },
  // Automatically spin up a local server for the tests
  webServer: {
    command: 'npx serve -p 3000 .',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
