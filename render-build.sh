#!/usr/bin/env bash
# render-build.sh
echo "Installing Node dependencies..."
npm install

echo "Installing Puppeteer's Chrome..."
npx puppeteer browsers install chrome

echo "Build complete."
