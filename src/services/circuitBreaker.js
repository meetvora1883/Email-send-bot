const { getCircuitBreakerState, updateCircuitBreaker, resetCircuitBreaker } = require('../database/queries');
const { logWarn, logInfo } = require('../utils/logger');
const config = require('../utils/config');

function isProviderOpen(provider) {
  const state = getCircuitBreakerState(provider);
  if (!state || !state.isOpen) return false;
  const openUntil = new Date(state.openUntil);
  if (Date.now() > openUntil.getTime()) {
    resetCircuitBreaker(provider);
    logInfo('CIRCUIT', `Circuit closed for ${provider} (timeout expired)`);
    return false;
  }
  return true;
}

function recordFailure(provider) {
  const state = getCircuitBreakerState(provider);
  let failures = (state?.failures || 0) + 1;
  const threshold = config.circuitBreaker.failureThreshold;
  const now = new Date().toISOString();
  if (failures >= threshold) {
    const openUntil = new Date(Date.now() + config.circuitBreaker.timeoutMinutes * 60000).toISOString();
    updateCircuitBreaker(provider, failures, now, true, openUntil);
    logWarn('CIRCUIT', `Circuit OPEN for ${provider} until ${openUntil}`);
  } else {
    updateCircuitBreaker(provider, failures, now, false, null);
  }
}

function recordSuccess(provider) {
  resetCircuitBreaker(provider);
  logInfo('CIRCUIT', `Circuit closed for ${provider} (success)`);
}

module.exports = { isProviderOpen, recordFailure, recordSuccess };