const nodemailer = require('nodemailer');
const { logInfo, logError, logWarn } = require('../utils/logger');
const { updateProviderStats } = require('../database/queries');
const config = require('../utils/config');

let alertChannelId = null;

async function checkProviderHealth(providerConfig) {
  const transporter = nodemailer.createTransport({
    host: providerConfig.host,
    port: providerConfig.port,
    secure: providerConfig.secure,
    auth: providerConfig.auth,
    timeout: 5000
  });
  try {
    await transporter.verify();
    const today = new Date().toISOString().split('T')[0];
    updateProviderStats(providerConfig.name, today, false, false, true, null);
    logInfo('HEALTH', `${providerConfig.name} is operational`);
    return true;
  } catch (error) {
    logWarn('HEALTH', `${providerConfig.name} health check failed: ${error.message}`);
    const today = new Date().toISOString().split('T')[0];
    updateProviderStats(providerConfig.name, today, false, false, false, new Date().toISOString());
    return false;
  }
}

async function runHealthChecks(client) {
  let allFailed = true;
  for (const provider of config.providers) {
    const ok = await checkProviderHealth(provider);
    if (ok) allFailed = false;
  }
  if (allFailed && alertChannelId && client) {
    const channel = client.channels.cache.get(alertChannelId);
    if (channel) await channel.send('⚠️ **CRITICAL**: All email providers are down! Immediate action required.');
    logError('HEALTH', 'All providers down!');
  }
}

function startHealthChecks(client) {
  alertChannelId = process.env.ALERT_CHANNEL_ID || null;
  setInterval(() => runHealthChecks(client), 30 * 60 * 1000);
}

module.exports = { startHealthChecks };