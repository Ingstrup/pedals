#!/bin/bash

echo "Initializing npm..."
npm init -y

echo "Installing Playwright and local server..."
npm install -D @playwright/test
npm install -D serve

echo "Installing Playwright browsers..."
npx playwright install chromium --with-deps

echo "Setting up test directory..."
mkdir -p tests

echo "✅ Testing environment ready!"
echo "Run your tests using: npx playwright test"