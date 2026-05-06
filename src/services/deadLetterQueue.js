const { getDeadLetterItems, deleteDeadLetterItem, addToQueueTable } = require('../database/queries');
const { logInfo } = require('../utils/logger');

function retryDeadLetters() {
  const items = getDeadLetterItems();
  if (items.length === 0) return;
  logInfo('DLQ', `Retrying ${items.length} dead letter emails`);
  for (const item of items) {
    addToQueueTable(item.recipient, item.subject, item.htmlContent, item.discordUserId, item.correlationId, null); // emailLogId null because it's a re-queue without a pre-log
    deleteDeadLetterItem(item.id);
    logInfo('DLQ', `Re-queued ${item.id}`, item.correlationId);
  }
}

let dlqInterval = null;
function startDLQRetryScheduler() {
  const intervalMinutes = parseInt(process.env.DLQ_RETRY_INTERVAL_MINUTES) || 60;
  dlqInterval = setInterval(retryDeadLetters, intervalMinutes * 60 * 1000);
}

module.exports = { retryDeadLetters, startDLQRetryScheduler };