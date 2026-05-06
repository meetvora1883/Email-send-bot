// src/utils/logger.js
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const getISTTime = () => {
  return new Date().toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

const writeToFile = (level, service, message) => {
  const timestamp = getISTTime();
  const line = `[${timestamp}] [${level}] [${service}] ${message}\n`;
  fs.appendFileSync(path.join(logsDir, 'combined.log'), line);
  if (level === 'ERROR') {
    fs.appendFileSync(path.join(logsDir, 'errors.log'), line);
  }
};

const logWithEmoji = (level, service, message, colorFn, emoji, correlationId = '') => {
  const timestamp = getISTTime();
  const corrPart = correlationId ? ` [${correlationId}]` : '';
  const consoleMsg = `[${timestamp}] [${level}] [${service}]${corrPart} ${emoji} ${message}`;
  console.log(colorFn(consoleMsg));
  writeToFile(level, service, `${corrPart} ${message}`);
};

module.exports = {
  logInfo: (service, message, correlationId = '') =>
    logWithEmoji('INFO', service, message, chalk.blue, 'ℹ️', correlationId),
  logSuccess: (service, message, correlationId = '') =>
    logWithEmoji('SUCCESS', service, message, chalk.green, '✔️', correlationId),
  logWarn: (service, message, correlationId = '') =>
    logWithEmoji('WARNING', service, message, chalk.yellow, '⚠️', correlationId),
  logError: (service, message, correlationId = '') =>
    logWithEmoji('ERROR', service, message, chalk.red, '✖️', correlationId),
  logDebug: (service, message, correlationId = '') => {
    if (process.env.LOG_LEVEL === 'debug') {
      logWithEmoji('DEBUG', service, message, chalk.magenta, '🐛', correlationId);
    }
  }
};