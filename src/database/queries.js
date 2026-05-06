const { getDB } = require('./sqlite');
const crypto = require('crypto');

function generateCorrelationId() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

function getNextDailyId() {
  const db = getDB();
  const today = getTodayDate();
  const row = db.prepare('SELECT MAX(dailyId) as maxId FROM emails WHERE date = ?').get(today);
  return (row?.maxId || 0) + 1;
}

function insertEmailLog(data) {
  const db = getDB();
  const today = getTodayDate();
  const dailyId = getNextDailyId();
  const stmt = db.prepare(`
    INSERT INTO emails (recipient, subject, message, messageId, providerUsed, status, errorMessage, discordUserId, retryCount, correlationId, date, dailyId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    data.recipient,
    data.subject,
    data.message || null,
    data.messageId || null,
    data.providerUsed || null,
    data.status,
    data.errorMessage || null,
    data.discordUserId || null,
    data.retryCount || 0,
    data.correlationId || generateCorrelationId(),
    today,
    dailyId
  );
  return { id: info.lastInsertRowid, dailyId, date: today, correlationId: data.correlationId };
}

function updateEmailLog(id, updates) {
  const db = getDB();
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }
  values.push(id);
  db.prepare(`UPDATE emails SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function getEmailByDateAndDailyId(date, dailyId) {
  const db = getDB();
  return db.prepare('SELECT * FROM emails WHERE date = ? AND dailyId = ?').get(date, dailyId);
}

function getEmailsByDate(date, limit = 100, offset = 0) {
  const db = getDB();
  return db.prepare('SELECT * FROM emails WHERE date = ? ORDER BY dailyId DESC LIMIT ? OFFSET ?').all(date, limit, offset);
}

function searchEmails(search, date, limit = 100) {
  const db = getDB();
  let query = 'SELECT * FROM emails WHERE 1=1';
  const params = [];
  if (search) {
    query += ' AND (recipient LIKE ? OR subject LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (date) {
    query += ' AND date = ?';
    params.push(date);
  }
  query += ' ORDER BY date DESC, dailyId DESC LIMIT ?';
  params.push(limit);
  return db.prepare(query).all(...params);
}

function getDistinctDates() {
  const db = getDB();
  return db.prepare('SELECT DISTINCT date FROM emails ORDER BY date DESC').all().map(r => r.date);
}

function getProviderStats(provider, date) {
  const db = getDB();
  let stats = db.prepare('SELECT * FROM provider_stats WHERE provider = ? AND date = ?').get(provider, date);
  if (!stats) {
    db.prepare('INSERT INTO provider_stats (provider, date, usageCount, failCount, isAvailable) VALUES (?, ?, 0, 0, 1)').run(provider, date);
    stats = { provider, date, usageCount: 0, failCount: 0, isAvailable: 1, lastFailure: null };
  }
  return stats;
}

function updateProviderStats(provider, date, incrementUsage = false, incrementFail = false, isAvailable = null, lastFailure = null) {
  const db = getDB();
  let sql = 'UPDATE provider_stats SET ';
  const params = [];
  if (incrementUsage) sql += 'usageCount = usageCount + 1, ';
  if (incrementFail) sql += 'failCount = failCount + 1, ';
  if (isAvailable !== null) { sql += 'isAvailable = ?, '; params.push(isAvailable ? 1 : 0); }
  if (lastFailure) { sql += 'lastFailure = ?, '; params.push(lastFailure); }
  sql = sql.replace(/,\s*$/, '');
  sql += ' WHERE provider = ? AND date = ?';
  params.push(provider, date);
  db.prepare(sql).run(...params);
}

function insertErrorLog(data) {
  const db = getDB();
  db.prepare(`
    INSERT INTO error_logs (errorType, provider, errorMessage, stackTrace, retryCount, correlationId)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(data.errorType, data.provider || null, data.errorMessage, data.stackTrace || null, data.retryCount || 0, data.correlationId || null);
}

function addToQueueTable(recipient, subject, htmlContent, discordUserId, correlationId, emailLogId) {
  const db = getDB();
  const stmt = db.prepare(`
    INSERT INTO queue (recipient, subject, htmlContent, discordUserId, correlationId, emailLogId, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `);
  const info = stmt.run(recipient, subject, htmlContent, discordUserId, correlationId, emailLogId);
  return info.lastInsertRowid;
}

function getPendingQueueItems(limit = 10) {
  const db = getDB();
  return db.prepare("SELECT * FROM queue WHERE status = 'pending' ORDER BY createdAt ASC LIMIT ?").all(limit);
}

function updateQueueItemStatus(id, status, attempts = null) {
  const db = getDB();
  let sql = 'UPDATE queue SET status = ?';
  const params = [status];
  if (attempts !== null) { sql += ', attempts = ?'; params.push(attempts); }
  sql += ' WHERE id = ?';
  params.push(id);
  db.prepare(sql).run(...params);
}

function deleteQueueItem(id) {
  getDB().prepare('DELETE FROM queue WHERE id = ?').run(id);
}

function addToDeadLetter(recipient, subject, htmlContent, discordUserId, correlationId, reason) {
  getDB().prepare(`
    INSERT INTO dead_letter_queue (recipient, subject, htmlContent, discordUserId, correlationId, reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(recipient, subject, htmlContent, discordUserId, correlationId, reason);
}

function getDeadLetterItems() {
  return getDB().prepare('SELECT * FROM dead_letter_queue ORDER BY failedAt ASC').all();
}

function deleteDeadLetterItem(id) {
  getDB().prepare('DELETE FROM dead_letter_queue WHERE id = ?').run(id);
}

function getUserHourlyCount(userId, hourSlot) {
  const row = getDB().prepare('SELECT count FROM user_rate_limits WHERE userId = ? AND hourSlot = ?').get(userId, hourSlot);
  return row ? row.count : 0;
}

function incrementUserHourlyCount(userId, hourSlot) {
  getDB().prepare(`
    INSERT INTO user_rate_limits (userId, hourSlot, count) VALUES (?, ?, 1)
    ON CONFLICT(userId, hourSlot) DO UPDATE SET count = count + 1
  `).run(userId, hourSlot);
}

function getGlobalMinuteCount(minuteSlot) {
  const row = getDB().prepare('SELECT count FROM global_rate_limits WHERE minuteSlot = ?').get(minuteSlot);
  return row ? row.count : 0;
}

function incrementGlobalMinuteCount(minuteSlot) {
  getDB().prepare(`
    INSERT INTO global_rate_limits (minuteSlot, count) VALUES (?, 1)
    ON CONFLICT(minuteSlot) DO UPDATE SET count = count + 1
  `).run(minuteSlot);
}

function getCircuitBreakerState(provider) {
  return getDB().prepare('SELECT * FROM circuit_breaker WHERE provider = ?').get(provider);
}

function updateCircuitBreaker(provider, failures, lastFailureTime, isOpen, openUntil) {
  getDB().prepare(`
    INSERT INTO circuit_breaker (provider, failures, lastFailureTime, isOpen, openUntil)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(provider) DO UPDATE SET
      failures = excluded.failures,
      lastFailureTime = excluded.lastFailureTime,
      isOpen = excluded.isOpen,
      openUntil = excluded.openUntil
  `).run(provider, failures, lastFailureTime, isOpen ? 1 : 0, openUntil);
}

function resetCircuitBreaker(provider) {
  getDB().prepare('DELETE FROM circuit_breaker WHERE provider = ?').run(provider);
}

function logCommandUsage(userId, userName, command, options = '') {
  getDB().prepare('INSERT INTO command_logs (userId, userName, command, options) VALUES (?, ?, ?, ?)').run(userId, userName, command, options);
}

// src/database/queries.js (add bill functions)
function getNextBillDailyId() {
  const db = getDB();
  const today = getTodayDate();
  const row = db.prepare('SELECT MAX(CAST(SUBSTR(billNumber, INSTR(billNumber, \'/\')+1) AS INTEGER)) as maxId FROM bills WHERE date = ?').get(today);
  return (row?.maxId || 0) + 1;
}

function insertBillLog(data) {
  const db = getDB();
  const today = getTodayDate();
  const dailyId = getNextBillDailyId();
  const billNumber = `${today}/${String(dailyId).padStart(3, '0')}`;
  const stmt = db.prepare(`
    INSERT INTO bills (recipient, subject, billNumber, date, customerName, vehicleNumber, vehicleType, meterReading, items, total, imagePath, htmlContent, discordUserId, correlationId, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued')
  `);
  const info = stmt.run(
    data.recipient,
    data.subject,
    billNumber,
    today,
    data.customerName,
    data.vehicleNumber,
    data.vehicleType,
    data.meterReading,
    JSON.stringify(data.items),
    data.total,
    data.imagePath || null,
    data.htmlContent || null,
    data.discordUserId,
    data.correlationId
  );
  return { id: info.lastInsertRowid, billNumber, date: today };
}

function updateBillLog(id, updates) {
  const db = getDB();
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }
  values.push(id);
  db.prepare(`UPDATE bills SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

// ... include these exports in module.exports

module.exports = {
  generateCorrelationId,
  insertEmailLog,
  updateEmailLog,
  getEmailByDateAndDailyId,
  getEmailsByDate,
  searchEmails,
  getDistinctDates,
  getProviderStats,
  updateProviderStats,
  insertErrorLog,
  addToQueueTable,
  getPendingQueueItems,
  updateQueueItemStatus,
  deleteQueueItem,
  addToDeadLetter,
  getDeadLetterItems,
  deleteDeadLetterItem,
  getUserHourlyCount,
  incrementUserHourlyCount,
  getGlobalMinuteCount,
  incrementGlobalMinuteCount,
  getCircuitBreakerState,
  updateCircuitBreaker,
  resetCircuitBreaker,
  logCommandUsage,
    getNextBillDailyId,
    insertBillLog,
    updateBillLog
};