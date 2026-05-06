// src/services/invoiceService.js
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { logInfo, logError } = require('../utils/logger');
const generateInvoiceHTML = require('../templates/invoiceTemplate');

const BILL_DIR = path.join(__dirname, '../../', process.env.BILL_IMAGE_DIR || 'generated-bills');
if (!fs.existsSync(BILL_DIR)) fs.mkdirSync(BILL_DIR, { recursive: true });

async function generateBillImage(data) {
  const {
    billNumber,
    date,
    customerName,
    vehicleNumber,
    vehicleType,
    meterReading,
    items,
    total,
    terms,
    authorizedSignatory
  } = data;

  const html = generateInvoiceHTML({
    billNumber,
    date,
    companyName: process.env.COMPANY_NAME || 'Company Name',
    companyAddress: process.env.COMPANY_ADDRESS || 'Address',
    companyPhone: process.env.COMPANY_PHONE || 'Phone',
    companyLogo: process.env.COMPANY_LOGO_URL || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    customerName,
    vehicleNumber,
    vehicleType,
    meterReading,
    items,
    total,
    terms,
    authorizedSignatory
  });

  const uniqueId = billNumber.replace(/\//g, '-');
  const fileName = `invoice-${uniqueId}.png`;
  const filePath = path.join(BILL_DIR, fileName);

  // NO executablePath – Puppeteer will use its own browser
  const launchOptions = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };

  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: filePath, fullPage: true, type: 'png' });
    logInfo('INVOICE', `Generated bill image: ${filePath}`);
    return { filePath, html };
  } catch (error) {
    logError('INVOICE', `Failed to generate bill image: ${error.message}`);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

function cleanupOldBills(days = 7) {
  const maxAge = days * 24 * 60 * 60 * 1000;
  if (!fs.existsSync(BILL_DIR)) return;
  const files = fs.readdirSync(BILL_DIR);
  const now = Date.now();
  for (const file of files) {
    const filePath = path.join(BILL_DIR, file);
    const stats = fs.statSync(filePath);
    if (now - stats.mtimeMs > maxAge) {
      fs.unlinkSync(filePath);
      logInfo('CLEANUP', `Removed old bill image: ${file}`);
    }
  }
}

module.exports = { generateBillImage, cleanupOldBills };
