const { getPendingQueueItems, getDeadLetterItems, getProviderStats, addToQueueTable, deleteDeadLetterItem } = require('../database/queries');
const { getDB } = require('../database/sqlite');
const { logInfo } = require('../utils/logger');
const config = require('../utils/config');

async function handleAdminCommand(interactionOrMessage, commandName) {
  const isInteraction = interactionOrMessage.isCommand?.();
  const user = isInteraction ? interactionOrMessage.user : interactionOrMessage.author;
  const member = interactionOrMessage.member;
  const reply = (content) => isInteraction ? interactionOrMessage.editReply(content) : interactionOrMessage.reply(content);

  // Permission check
  const isAdmin = member.permissions.has('Administrator') ||
                  (config.discord.adminRoleId && member.roles.cache.has(config.discord.adminRoleId));
  if (!isAdmin) {
    await reply('❌ Admin only command.');
    return;
  }

  const cmd = commandName || interactionOrMessage.content.trim().slice(1).split(' ')[0]; // fallback for prefix

  if (cmd === 'mailstats') {
    const db = getDB();
    const total = db.prepare(`SELECT COUNT(*) as c FROM emails`).get().c;
    const success = db.prepare(`SELECT COUNT(*) as c FROM emails WHERE status='success'`).get().c;
    const failed = db.prepare(`SELECT COUNT(*) as c FROM emails WHERE status='failed'`).get().c;
    const queue = db.prepare(`SELECT COUNT(*) as c FROM queue WHERE status='pending'`).get().c;
    const dlq = db.prepare(`SELECT COUNT(*) as c FROM dead_letter_queue`).get().c;
    await reply(`📊 **Email Stats**\nTotal: ${total}\nSuccess: ${success}\nFailed: ${failed}\nQueue pending: ${queue}\nDead letter: ${dlq}`);
    logInfo('ADMIN', `Stats requested by ${user.tag}`);
  }

  else if (cmd === 'providerstatus') {
    const today = new Date().toISOString().split('T')[0];
    let replyStr = '**Provider Status**\n';
    for (const p of config.providers) {
      const stats = getProviderStats(p.name, today);
      const status = stats.isAvailable ? '✅ Available' : '❌ Unavailable';
      replyStr += `\n- **${p.name.toUpperCase()}**: ${status} | Usage: ${stats.usageCount}/${p.dailyLimit} | Failures: ${stats.failCount}`;
    }
    await reply(replyStr);
    logInfo('ADMIN', `${user.tag} checked provider status`);
  }

  else if (cmd === 'queue') {
    const items = getPendingQueueItems(10);
    if (items.length === 0) {
      await reply('Queue is empty.');
    } else {
      let replyStr = `**Queue (${items.length} items)**\n`;
      for (const item of items) {
        replyStr += `\nID: ${item.id} | To: ${item.recipient} | Attempts: ${item.attempts}`;
      }
      await reply(replyStr);
    }
    logInfo('ADMIN', `${user.tag} viewed queue`);
  }

  else if (cmd === 'retryfailed') {
    const dlq = getDeadLetterItems();
    if (dlq.length === 0) {
      await reply('No failed emails in dead letter queue.');
    } else {
      for (const item of dlq) {
        addToQueueTable(item.recipient, item.subject, item.htmlContent, item.discordUserId, item.correlationId);
        deleteDeadLetterItem(item.id);
      }
      await reply(`Re-queued ${dlq.length} failed emails.`);
      logInfo('ADMIN', `${user.tag} retried ${dlq.length} dead letters`);
    }
  }
}

module.exports = { handleAdminCommand };