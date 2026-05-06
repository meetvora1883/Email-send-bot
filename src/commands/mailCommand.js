const { validateCommand, sanitizeInput, validateEmail } = require('../utils/validators');
const { addToQueue } = require('../services/queueService');
const { checkRateLimits, incrementRateLimits } = require('../utils/rateLimiter');
const { logInfo, logWarn, logError } = require('../utils/logger');
const config = require('../utils/config');
const { generateCorrelationId, logCommandUsage } = require('../database/queries');

const cooldowns = new Map();

function isAuthorized(member) {
  if (config.discord.adminRoleId && member.roles.cache.has(config.discord.adminRoleId)) return true;
  if (config.discord.allowedUsers.length > 0 && config.discord.allowedUsers.includes(member.id)) return true;
  return (!config.discord.adminRoleId && config.discord.allowedUsers.length === 0);
}

async function handleMailCommand(interactionOrMessage) {
  let user, options, replyFn, deferFn;

  // Determine if interaction or message
  if (interactionOrMessage.isCommand?.()) {
    // Slash command
    const interaction = interactionOrMessage;
    user = interaction.user;
    const recipient = interaction.options.getString('recipient');
    const subject = interaction.options.getString('subject');
    const message = interaction.options.getString('message');
    options = { email: recipient, subject, message };

    // Log command usage
    logCommandUsage(user.id, user.tag, '/mail', `${recipient} | ${subject} | ${message}`);
    console.log(`[SLASH] ${user.tag} used /mail: ${recipient} "${subject}"`);

    replyFn = (content) => interaction.editReply(content);
    deferFn = async () => await interaction.deferReply();
  } else {
    // Prefix message command
    const messageObj = interactionOrMessage;
    user = messageObj.author;
    const parsed = validateCommand(messageObj.content);
    if (!parsed) return false;
    options = parsed;
    // Log usage
    logCommandUsage(user.id, user.tag, '!mail', `${options.email} | ${options.subject} | ${options.message}`);
    console.log(`[PREFIX] ${user.tag} used !mail: ${options.email} "${options.subject}"`);

    replyFn = (content) => messageObj.reply(content);
    deferFn = null; // no defer available
  }

  // Authorization
  if (interactionOrMessage.isCommand?.()) {
    if (!isAuthorized(interactionOrMessage.member)) {
      await replyFn('❌ You are not authorized to use this command.');
      return true;
    }
  } else {
    if (!isAuthorized(interactionOrMessage.member)) {
      await replyFn('❌ You are not authorized to use this command.');
      return true;
    }
  }

  // Cooldown
  const now = Date.now();
  const cooldownKey = user.id;
  if (cooldowns.has(cooldownKey)) {
    const expiration = cooldowns.get(cooldownKey) + config.cooldownSeconds * 1000;
    if (now < expiration) {
      const remaining = Math.ceil((expiration - now) / 1000);
      await replyFn(`⏳ Please wait ${remaining} seconds before sending another email.`);
      return true;
    }
  }

  // Rate limits
  if (!checkRateLimits(user.id)) {
    await replyFn('❌ Rate limit exceeded. Please try again later.');
    return true;
  }

  // Validation
  if (!validateEmail(options.email)) {
    await replyFn('❌ Invalid email address format.');
    return true;
  }

  // Sanitize
  const sanitized = {
    email: sanitizeInput(options.email),
    subject: sanitizeInput(options.subject),
    message: sanitizeInput(options.message)
  };

  const isHtml = sanitized.message.trim().startsWith('<') ||
                 sanitized.message.includes('<div') ||
                 sanitized.message.includes('<p>');
  const finalMessage = isHtml ? sanitized.message : `<p>${sanitized.message.replace(/\n/g, '<br>')}</p>`;

  const correlationId = generateCorrelationId();

  // Add to queue
  addToQueue({ recipient: sanitized.email, subject: sanitized.subject, htmlContent: finalMessage }, user.id, correlationId);

  incrementRateLimits(user.id);
  cooldowns.set(cooldownKey, now);
  setTimeout(() => cooldowns.delete(cooldownKey), config.cooldownSeconds * 1000);

  await replyFn(`📧 Email queued for ${sanitized.email} (ID: ${correlationId})`);
  logInfo('COMMAND', `${user.tag} queued email to ${sanitized.email} [${correlationId}]`);
  return true;
}

module.exports = { handleMailCommand };