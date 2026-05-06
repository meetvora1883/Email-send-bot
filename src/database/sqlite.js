const Database = require('better-sqlite3');
const path = require('path');
const { logInfo } = require('../utils/logger');

let db;

function initializeDB() {
  const dbPath = process.env.DB_PATH || 'database.sqlite';
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  createTables();
  logInfo('DB', 'SQLite database initialized');
  return db;
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT,
      messageId TEXT,
      providerUsed TEXT,
      status TEXT CHECK(status IN ('queued', 'success', 'failed', 'dead')) DEFAULT 'queued',
      errorMessage TEXT,
      discordUserId TEXT,
      retryCount INTEGER DEFAULT 0,
      correlationId TEXT,
      date TEXT NOT NULL,
      dailyId INTEGER NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS provider_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      date TEXT NOT NULL,
      usageCount INTEGER DEFAULT 0,
      failCount INTEGER DEFAULT 0,
      lastFailure DATETIME,
      isAvailable INTEGER DEFAULT 1,
      UNIQUE(provider, date)
    );

    CREATE TABLE IF NOT EXISTS error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      errorType TEXT NOT NULL,
      provider TEXT,
      errorMessage TEXT,
      stackTrace TEXT,
      retryCount INTEGER,
      correlationId TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      htmlContent TEXT NOT NULL,
      discordUserId TEXT,
      correlationId TEXT,
      emailLogId INTEGER,
      status TEXT DEFAULT 'pending',
      attempts INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dead_letter_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      htmlContent TEXT NOT NULL,
      discordUserId TEXT,
      correlationId TEXT,
      reason TEXT,
      failedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      retryCount INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_rate_limits (
      userId TEXT NOT NULL,
      hourSlot TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      PRIMARY KEY (userId, hourSlot)
    );

    CREATE TABLE IF NOT EXISTS global_rate_limits (
      minuteSlot TEXT PRIMARY KEY,
      count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS circuit_breaker (
      provider TEXT PRIMARY KEY,
      failures INTEGER DEFAULT 0,
      lastFailureTime DATETIME,
      isOpen INTEGER DEFAULT 0,
      openUntil DATETIME
    );

    CREATE TABLE IF NOT EXISTS command_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT,
      userName TEXT,
      command TEXT,
      options TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient TEXT NOT NULL,
    subject TEXT,
    billNumber TEXT NOT NULL,
    date TEXT NOT NULL,
    customerName TEXT,
    vehicleNumber TEXT,
    vehicleType TEXT,
    meterReading TEXT,
    items TEXT,           -- JSON string
    total REAL,
    imagePath TEXT,
    htmlContent TEXT,
    status TEXT DEFAULT 'queued',
    discordUserId TEXT,
    correlationId TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );



  `);
  logInfo('DB', 'All tables verified/created');
}

function getDB() {
  if (!db) initializeDB();
  return db;
}

module.exports = { initializeDB, getDB };