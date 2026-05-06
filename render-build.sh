#!/usr/bin/env bash
# render-build.sh
# Install Chromium for Puppeteer
apt-get update && apt-get install -y chromium-browser
# Install Node dependencies
npm install
