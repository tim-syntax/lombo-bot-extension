// Constants for Limbo Bot - wrapped in IIFE to avoid scope conflicts
(function() {
  'use strict';
  
  // Bet amounts for each step
  const BET_SEQUENCE = [0, 0, 0, 0.01, 0.02, 0.07, 0.2, 0.4, 0.8, 2, 4, 8];

  // Payout sequence: all steps = 2
  const PAYOUT_SEQUENCE = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];

  // Win threshold - result >= 2.0 is a win
  const WIN_THRESHOLD = 2.0;

  // Profit/Loss thresholds for auto-reset
  const PROFIT_THRESHOLD = 2.6;  // Auto-reset when profit exceeds this value
  const LOSS_THRESHOLD = 4;    // Auto-reset when loss exceeds this value (negative)

  // Export to global object for Chrome extension compatibility
  const globalObj = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis);
  globalObj.LimboBotConstants = {
    BET_SEQUENCE,
    PAYOUT_SEQUENCE,
    WIN_THRESHOLD,
    PROFIT_THRESHOLD,
    LOSS_THRESHOLD
  };
})();

