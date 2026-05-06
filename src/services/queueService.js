const { sendWithFailover } = require('./mailService');
const {
  addToQueueTable,
  getPendingQueueItems,
  updateQueueItemStatus,
  deleteQueueItem,
  addToDeadLetter,
} = require('../database/queries');
const { logInfo, logError, logSuccess, logWarn } = require('../utils/logger');
const config = require('../utils/config');

let isProcessing = false;
let workerInterval = null;

function addToQueue(emailData, discordUserId, correlationId) {
  addToQueueTable(emailData.recipient, emailData.subject, emailData.htmlContent, discordUserId, correlationId, emailData.emailLogId);
  logInfo('QUEUE', `Email added (Log ID: ${emailData.emailLogId})`, correlationId);
  if (!isProcessing) startWorkers();
}

async function processQueueItem(item) {
  const { id, recipient, subject, htmlContent, discordUserId, correlationId, emailLogId } = item;
  logInfo('QUEUE', `Processing item ${id} to ${recipient}`, correlationId);
  updateQueueItemStatus(id, 'processing', item.attempts + 1);
  try {
    const result = await sendWithFailover(recipient, subject, htmlContent, discordUserId, correlationId, emailLogId);
    if (result.success) {
      deleteQueueItem(id);
      logSuccess('QUEUE', `Completed ${id} via ${result.provider}`, correlationId);
      return true;
    } else {
      if (item.attempts + 1 >= 3) {
        addToDeadLetter(recipient, subject, htmlContent, discordUserId, correlationId, 'All providers failed after 3 attempts');
        deleteQueueItem(id);
        logWarn('QUEUE', `Moved ${id} to DLQ`, correlationId);
      } else {
        updateQueueItemStatus(id, 'pending', item.attempts + 1);
        logWarn('QUEUE', `Re-queued ${id} (attempt ${item.attempts+1})`, correlationId);
      }
      return false;
    }
  } catch (err) {
    logError('QUEUE', `Error processing ${id}: ${err.message}`, correlationId);
    if (item.attempts + 1 >= 3) {
      addToDeadLetter(recipient, subject, htmlContent, discordUserId, correlationId, `Error: ${err.message}`);
      deleteQueueItem(id);
    } else {
      updateQueueItemStatus(id, 'pending', item.attempts + 1);
    }
    return false;
  }
}

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const items = getPendingQueueItems(5);
    for (const item of items) {
      await processQueueItem(item);
      await new Promise(resolve => setTimeout(resolve, config.queueDelayMs));
    }
  } finally {
    isProcessing = false;
  }
}

function startWorkers() {
  if (workerInterval) return;
  workerInterval = setInterval(processQueue, 2000);
}

function resumeQueue() {
  const pending = getPendingQueueItems(100);
  if (pending.length > 0) {
    logInfo('QUEUE', `Resuming ${pending.length} pending items from database`);
    startWorkers();
  }
}

module.exports = { addToQueue, resumeQueue };