require('dotenv').config();

module.exports = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    adminRoleId: process.env.ADMIN_ROLE_ID || null,
    allowedUsers: process.env.ALLOWED_USERS ? process.env.ALLOWED_USERS.split(',') : []
  },
  cooldownSeconds: parseInt(process.env.COOLDOWN_SECONDS) || 30,
  queueDelayMs: parseInt(process.env.QUEUE_DELAY_MS) || 1500,
  maxEmailsPerUserPerHour: parseInt(process.env.MAX_EMAILS_PER_USER_PER_HOUR) || 5,
  globalMaxPerMinute: parseInt(process.env.GLOBAL_MAX_PER_MINUTE) || 10,
  circuitBreaker: {
    failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD) || 3,
    timeoutMinutes: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT_MINUTES) || 15
  },
  web: {
    host: process.env.WEB_HOST || 'http://localhost',
    port: parseInt(process.env.WEB_PORT) || 3001
  },
  providers: [
    {
      name: 'gmail',
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      dailyLimit: parseInt(process.env.GMAIL_DAILY_LIMIT) || 2000,
      priority: 1
    },
    {
      name: 'sendgrid',
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: { user: process.env.SENDGRID_USER, pass: process.env.SENDGRID_PASSWORD },
      dailyLimit: parseInt(process.env.SENDGRID_DAILY_LIMIT) || 10000,
      priority: 2
    },
    {
      name: 'mailgun',
      host: 'smtp.mailgun.org',
      port: 587,
      secure: false,
      auth: { user: process.env.MAILGUN_USER, pass: process.env.MAILGUN_PASSWORD },
      dailyLimit: parseInt(process.env.MAILGUN_DAILY_LIMIT) || 5000,
      priority: 3
    }
  ]
};