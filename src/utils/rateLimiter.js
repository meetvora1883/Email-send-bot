const {
  getUserHourlyCount,
  incrementUserHourlyCount,
  getGlobalMinuteCount,
  incrementGlobalMinuteCount,
} = require('../database/queries');
const config = require('./config');
const { logWarn } = require('./logger');

function getHourSlot() {
  const now = new Date();
  return `${now.toISOString().slice(0, 13)}:00`;
}

function getMinuteSlot() {
  const now = new Date();
  return now.toISOString().slice(0, 16);
}

function checkRateLimits(userId) {
  const hourSlot = getHourSlot();
  const userCount = getUserHourlyCount(userId, hourSlot);
  if (userCount >= config.maxEmailsPerUserPerHour) {
    logWarn('RATE', `User ${userId} exceeded hourly limit (${userCount}/${config.maxEmailsPerUserPerHour})`);
    return false;
  }
  const minuteSlot = getMinuteSlot();
  const globalCount = getGlobalMinuteCount(minuteSlot);
  if (globalCount >= config.globalMaxPerMinute) {
    logWarn('RATE', `Global per-minute limit exceeded (${globalCount}/${config.globalMaxPerMinute})`);
    return false;
  }
  return true;
}

function incrementRateLimits(userId) {
  incrementUserHourlyCount(userId, getHourSlot());
  incrementGlobalMinuteCount(getMinuteSlot());
}

module.exports = { checkRateLimits, incrementRateLimits };