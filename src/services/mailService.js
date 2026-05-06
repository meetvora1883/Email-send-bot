const nodemailer = require('nodemailer');
const config = require('../utils/config');
const {
  getProviderStats,
  updateProviderStats,
  insertErrorLog,
  insertEmailLog,
  updateEmailLog,
  getDB
} = require('../database/queries');
const { isProviderOpen, recordFailure, recordSuccess } = require('./circuitBreaker');
const { logInfo, logError, logWarn, logSuccess } = require('../utils/logger');

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

async function sendWithProvider(providerConfig, mailOptions, retryCount = 2) {
  const transporter = nodemailer.createTransport({
    host: providerConfig.host,
    port: providerConfig.port,
    secure: providerConfig.secure,
    auth: providerConfig.auth,
    timeout: 10000,
  });
  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      const info = await transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      const isRetryable = ['ESOCKET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAUTH'].some(code => error.code?.includes(code));
      if (isRetryable && attempt < retryCount) {
        logWarn('MAIL', `${providerConfig.name} attempt ${attempt} failed, retrying... (${error.message})`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw error;
    }
  }
}

async function sendWithFailover(to, subject, htmlContent, discordUserId, correlationId, emailLogId = null) {
  const sortedProviders = [...config.providers].sort((a, b) => a.priority - b.priority);
  const today = getTodayStr();

  let logId;
  let dailyId;
  let date;

  if (emailLogId) {
    const db = getDB();
    const log = db.prepare('SELECT * FROM emails WHERE id = ?').get(emailLogId);
    if (!log) throw new Error('Email log not found');
    date = log.date;
    dailyId = log.dailyId;
    logId = emailLogId;
  } else {
    const insert = insertEmailLog({
      recipient: to,
      subject,
      message: htmlContent,
      discordUserId,
      correlationId,
      status: 'queued'
    });
    logId = insert.id;
    date = insert.date;
    dailyId = insert.dailyId;
  }

  const previewUrl = `${config.web.host}:${config.web.port}/email/${date}/${dailyId}`;
  const previewFooter = `
    <br><br>
    <div style="border-top:1px solid #ddd; margin-top:20px; padding-top:10px; font-size:0.9em; color:#555;">
      <a href="${previewUrl}" style="color:#555;">View this email online</a>
    </div>`;
  const finalHtml = htmlContent + previewFooter;

  const mailOptions = {
    from: `"Discord Bot" <${sortedProviders[0].auth.user}>`,
    to, subject,
    html: finalHtml,
      attachments: attachments,
    headers: {
      'X-Mailer': 'DiscordEmailBot/2.3',
      'Message-ID': `<${correlationId}@discord-email-bot>`
    }
  };

  for (const provider of sortedProviders) {
    if (isProviderOpen(provider.name)) {
      logWarn('MAIL', `${provider.name} circuit open, skipping`, correlationId);
      continue;
    }
    const stats = getProviderStats(provider.name, today);
    if (stats.usageCount >= provider.dailyLimit) {
      logWarn('MAIL', `${provider.name} daily limit reached (${stats.usageCount}/${provider.dailyLimit})`, correlationId);
      continue;
    }
    if (!stats.isAvailable) {
      logWarn('MAIL', `${provider.name} marked unavailable`, correlationId);
      continue;
    }
    try {
      logInfo('MAIL', `Attempting via ${provider.name}`, correlationId);
      const result = await sendWithProvider(provider, mailOptions, 2);
      updateProviderStats(provider.name, today, true, false, true, null);
      recordSuccess(provider.name);
      updateEmailLog(logId, {
        status: 'success',
        providerUsed: provider.name,
        messageId: result.messageId,
        message: finalHtml
      });
      logSuccess('MAIL', `Sent via ${provider.name} (ID: ${result.messageId})`, correlationId);
      return { success: true, provider: provider.name, dailyId, date };
    } catch (error) {
      logError('MAIL', `${provider.name} failed: ${error.message}`, correlationId);
      updateProviderStats(provider.name, today, false, true, null, new Date().toISOString());
      recordFailure(provider.name);
      insertErrorLog({
        errorType: error.code || 'SMTP_ERROR',
        provider: provider.name,
        errorMessage: error.message,
        stackTrace: error.stack,
        correlationId,
        retryCount: 1
      });
      updateEmailLog(logId, {
        status: 'failed',
        errorMessage: error.message,
        providerUsed: provider.name,
        message: finalHtml
      });
    }
  }

  updateEmailLog(logId, { status: 'failed', errorMessage: 'All providers failed', message: finalHtml });
  return { success: false, provider: null, dailyId, date };
}

module.exports = { sendWithFailover };