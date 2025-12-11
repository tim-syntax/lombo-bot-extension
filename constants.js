// Constants for Limbo Bot - wrapped in IIFE to avoid scope conflicts
(function() {
  'use strict';
  
  // Bet amounts for each step
  const BET_SEQUENCE = [0.01, 0.02, 0.04, 0.1, 0.2, 0.4, 1, 2, 4, 10, 20, 40];

  // Payout sequence: all steps = 2
  const PAYOUT_SEQUENCE = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];

  // Win threshold - result >= 2.0 is a win
  const WIN_THRESHOLD = 2.0;

  // Profit/Loss thresholds for auto-reset
  const PROFIT_THRESHOLD = 0.26;  // Auto-reset when profit exceeds this value
  const LOSS_THRESHOLD = 0.09;    // Auto-reset when loss exceeds this value (negative)

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

