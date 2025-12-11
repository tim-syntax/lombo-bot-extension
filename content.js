// BC.Game Limbo Bot - Content Script

(function() {
  'use strict';

  // Get constants from global object (loaded via constants.js)
  const { BET_SEQUENCE, PAYOUT_SEQUENCE, WIN_THRESHOLD, PROFIT_THRESHOLD, LOSS_THRESHOLD } = self.LimboBotConstants || window.LimboBotConstants || {};
  
  // Bot state
  let state = {
    isRunning: false,
    currentStep: 1,
    wins: 0,
    losses: 0,
    betDelay: 1000,
    lastResultValue: null,
    totalProfit: 0,
    testMode: false
  };

  let botInterval = null;
  let isProcessing = false;
  let lastKnownResult = null;

  // Selectors based on actual BC.Game Limbo page structure
  const SELECTORS = {
    // Amount input - inside the div with "nowidth-input" class
    amountInput: '.nowidth-input input[inputmode="decimal"], input[inputmode="decimal"], input[size="lg"]',
    // Payout input - the second decimal input (after amount)
    payoutInput: '.input.rounded-lg input[inputmode="decimal"]',
    // Bet button - has button-brand class
    betButton: 'button.button-brand',
    // Result display - the big multiplier number with font-mono class
    resultDisplay: 'span.text-brand.font-mono, span.font-mono[style*="color"]',
    // History items at the top
    historyItems: '.grid-auto-flow-column > div[id]'
  };

  // Load saved state
  async function loadState() {
    try {
      const result = await chrome.storage.local.get(['botState']);
      if (result.botState) {
        state = { ...state, ...result.botState };
      }
    } catch (e) {
      console.log('Could not load state:', e);
    }
  }

  // Save state
  async function saveState() {
    try {
      await chrome.storage.local.set({ botState: state });
      // Notify popup of state change
      chrome.runtime.sendMessage({ type: 'stateUpdate', state });
    } catch (e) {
      console.log('Could not save state:', e);
    }
  }

  // Log to popup
  function log(message, logType = 'info') {
    console.log(`[Limbo Bot] ${message}`);
    try {
      chrome.runtime.sendMessage({ type: 'log', message, logType });
    } catch (e) {
      // Popup might be closed
    }
  }

  // Find element with multiple selector attempts
  function findElement(selectorString) {
    const selectors = selectorString.split(', ');
    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el) return el;
      } catch (e) {
        // Invalid selector, try next
      }
    }
    return null;
  }

  // Find the amount input field
  function findAmountInput() {
    // Try the main selectors first
    let input = findElement(SELECTORS.amountInput);
    if (input) return input;

    // Look for input near "Amount" label
    const amountLabel = Array.from(document.querySelectorAll('label')).find(
      l => l.textContent.includes('Amount')
    );
    if (amountLabel) {
      const container = amountLabel.closest('[role="group"]');
      if (container) {
        input = container.querySelector('input[inputmode="decimal"]');
        if (input) return input;
      }
    }

    // Fallback: find any decimal input in the betting panel
    const bettingPanel = document.querySelector('[id*="tabs-cl"][id*="-content-manual"]');
    if (bettingPanel) {
      input = bettingPanel.querySelector('input[inputmode="decimal"]');
      if (input) return input;
    }

    // Last resort: first visible decimal input
    const inputs = document.querySelectorAll('input[inputmode="decimal"]');
    for (const inp of inputs) {
      const rect = inp.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return inp;
      }
    }

    return null;
  }

  // Find the payout input field
  function findPayoutInput() {
    // Look for input near "Payout" or "Multiplier" label
    const payoutLabel = Array.from(document.querySelectorAll('label')).find(
      l => l.textContent.toLowerCase().includes('payout') || l.textContent.toLowerCase().includes('multiplier')
    );
    if (payoutLabel) {
      const container = payoutLabel.closest('[role="group"]') || payoutLabel.parentElement;
      if (container) {
        const input = container.querySelector('input[inputmode="decimal"]');
        if (input) return input;
      }
    }

    // Try to find by selector for payout div
    const payoutDiv = document.querySelector('.input.rounded-lg');
    if (payoutDiv) {
      const input = payoutDiv.querySelector('input[inputmode="decimal"]');
      if (input) return input;
    }

    // Fallback: get all decimal inputs and find the one that's NOT the amount input
    const allInputs = document.querySelectorAll('input[inputmode="decimal"]');
    const amountInput = findAmountInput();
    for (const input of allInputs) {
      if (input !== amountInput) {
        const rect = input.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return input;
        }
      }
    }

    return null;
  }

  // Find the bet button
  function findBetButton() {
    // Try the main selector first
    let button = findElement(SELECTORS.betButton);
    if (button && button.textContent.trim().toLowerCase() === 'bet') {
      return button;
    }

    // Find button with "Bet" text and button-brand class
    const buttons = document.querySelectorAll('button.button-brand');
    for (const btn of buttons) {
      const text = btn.textContent.trim().toLowerCase();
      if (text === 'bet') {
        return btn;
      }
    }

    // Fallback: any button with exact "Bet" text
    const allButtons = document.querySelectorAll('button');
    for (const btn of allButtons) {
      const text = btn.textContent.trim();
      if (text === 'Bet') {
        return btn;
      }
    }

    return null;
  }

  // Get the current result multiplier value
  function getResultValue() {
    // Look for the main result display (big multiplier number)
    const resultElement = document.querySelector('span.text-brand.font-mono');
    if (resultElement) {
      // Extract number from text like "12.09×"
      const text = resultElement.textContent;
      const match = text.match(/(\d+\.?\d*)/);
      if (match) {
        return parseFloat(match[1]);
      }
    }

    // Alternative: check the first history item
    const historyItems = document.querySelectorAll(SELECTORS.historyItems);
    if (historyItems.length > 0) {
      const firstItem = historyItems[0];
      const text = firstItem.textContent;
      const match = text.match(/(\d+\.?\d*)/);
      if (match) {
        return parseFloat(match[1]);
      }
    }

    return null;
  }

  // Check if result is win based on current step's payout threshold
  function isWin(value, currentStep) {
    const threshold = PAYOUT_SEQUENCE[currentStep - 1];
    return value >= threshold;
  }

  // Set input value with proper events
  function setInputValue(input, value) {
    // Focus the input first
    input.focus();
    
    // Clear existing value
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Set new value using native setter
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(input, value.toString());
    
    // Trigger all necessary events
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    
    // Also try React's synthetic event
    const evt = new Event('input', { bubbles: true });
    evt.simulated = true;
    input.dispatchEvent(evt);
  }

  // Check result based on multiplier value
  // Win condition: result >= 2.0 (green color)
  // Lose condition: result < 2.0 (gray/black color)
  function checkResult() {
    const value = getResultValue();
    
    if (value !== null && value !== lastKnownResult) {
      lastKnownResult = value;
      state.lastResultValue = value;
      
      if (isWin(value, state.currentStep)) {
        return { result: 'win', value };
      } else {
        return { result: 'lose', value };
      }
    }
    
    return null;
  }

  // Update waitForResult to use current step
  function waitForResult(timeout = 6000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const initialResult = getResultValue();
      const currentStep = state.currentStep; // Capture current step
      
      const checkInterval = setInterval(() => {
        const currentResult = getResultValue();
        
        // Result changed - new bet result available
        if (currentResult !== null && currentResult !== initialResult) {
          clearInterval(checkInterval);
          
          // Small delay to ensure UI is fully updated
          setTimeout(() => {
            const finalValue = getResultValue();
            if (finalValue !== null) {
              lastKnownResult = finalValue;
              state.lastResultValue = finalValue;
              
              if (isWin(finalValue, currentStep)) {
                resolve({ result: 'win', value: finalValue });
              } else {
                resolve({ result: 'lose', value: finalValue });
              }
            } else {
              resolve(null);
            }
          }, 300);
        }
        
        // Timeout
        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          resolve(null);
        }
      }, 150);
    });
  }

  // Main betting function
  async function placeBet() {
    if (!state.isRunning || isProcessing) return;
    
    isProcessing = true;
    
    try {
      // Validate and fix currentStep if out of bounds
      if (state.currentStep < 1 || state.currentStep > BET_SEQUENCE.length) {
        log(`⚠️ Invalid step ${state.currentStep}, resetting to step 1`, 'info');
        state.currentStep = 1;
      }
      
      const amountInput = findAmountInput();
      const payoutInput = findPayoutInput();
      const betButton = findBetButton();
      
      if (!amountInput) {
        log('❌ Could not find amount input field!', 'lose');
        isProcessing = false;
        return;
      }
      
      if (!payoutInput) {
        log('❌ Could not find payout input field!', 'lose');
        isProcessing = false;
        return;
      }
      
      if (!betButton) {
        log('❌ Could not find bet button!', 'lose');
        isProcessing = false;
        return;
      }
      
      // Get current bet amount and payout based on step (or 0.01 in test mode)
      const stepIndex = state.currentStep - 1;
      const betAmount = state.testMode ? 0.01 : BET_SEQUENCE[stepIndex];
      const payout = PAYOUT_SEQUENCE[stepIndex];
      
      log(`📍 Step ${state.currentStep}: Betting $${betAmount} @ ${payout}x${state.testMode ? ' (TEST)' : ''}`, 'info');
      
      // Set the payout first
      setInputValue(payoutInput, payout);
      
      // Small delay between setting values
      await new Promise(r => setTimeout(r, 200));
      
      // Set the bet amount
      setInputValue(amountInput, betAmount);
      
      // Small delay before clicking to ensure values are set
      await new Promise(r => setTimeout(r, 400));
      
      // Record the result before clicking
      const beforeResult = getResultValue();
      
      // Click bet button
      betButton.click();
      
      // Wait for result
      const resultData = await waitForResult(8000);
      
      if (resultData && resultData.result === 'win') {
        state.wins++;
        const winAmount = betAmount * (payout - 1); // Net profit on win
        state.totalProfit += winAmount;
        state.currentStep = 1; // Reset to step 1 on win
        log(`✅ WIN! ${resultData.value}x (+$${winAmount.toFixed(2)}) → Step 1`, 'win');
      } else if (resultData && resultData.result === 'lose') {
        state.losses++;
        state.totalProfit -= betAmount; // Lose = -betAmount
        const maxSteps = BET_SEQUENCE.length;
        const nextStep = state.currentStep < maxSteps ? state.currentStep + 1 : 1;
        const wasReset = state.currentStep === maxSteps;
        state.currentStep = nextStep;
        
        if (wasReset) {
          log(`❌ LOSE ${resultData.value}x (-$${betAmount}) → Reset to Step 1`, 'lose');
        } else {
          log(`❌ LOSE ${resultData.value}x (-$${betAmount}) → Step ${nextStep}`, 'lose');
        }
      } else {
        log('⏳ Could not determine result, will retry...', 'info');
      }
      
      await saveState();
      
      // Check profit thresholds and auto reset/restart if needed
      if (await checkProfitThresholds()) {
        return; // Exit early if auto-reset was triggered
      }
      
    } catch (error) {
      log(`🔥 Error: ${error.message}`, 'lose');
    } finally {
      isProcessing = false;
    }
  }

  // Start the bot
  function startBot(betDelay = 1000, testMode = false) {
    if (state.isRunning) return;
    
    state.isRunning = true;
    state.betDelay = betDelay;
    state.testMode = testMode;
    saveState();
    
    log(testMode ? '🧪 Bot started in TEST MODE ($0.01 only)' : '🚀 Bot started!', 'info');
    
    // Initial bet
    setTimeout(placeBet, 500);
    
    // Set up interval for continuous betting
    botInterval = setInterval(() => {
      if (state.isRunning && !isProcessing) {
        placeBet();
      }
    }, state.betDelay);
  }

  // Stop the bot
  function stopBot() {
    state.isRunning = false;
    
    if (botInterval) {
      clearInterval(botInterval);
      botInterval = null;
    }
    
    saveState();
    log('Bot stopped!', 'info');
  }

  // Load balance history
  async function loadBalanceHistory() {
    try {
      const result = await chrome.storage.local.get(['balanceHistory']);
      return result.balanceHistory || [];
    } catch (e) {
      console.log('Could not load balance history:', e);
      return [];
    }
  }

  // Save balance history
  async function saveBalanceHistory(history) {
    try {
      await chrome.storage.local.set({ balanceHistory: history });
    } catch (e) {
      console.log('Could not save balance history:', e);
    }
  }

  // Add balance point to history (cumulative)
  async function addBalancePoint(profitDelta) {
    const history = await loadBalanceHistory();
    
    // Calculate new cumulative balance
    let currentBalance = 0;
    if (history.length > 0) {
      currentBalance = history[history.length - 1].balance;
    }
    const newBalance = currentBalance + profitDelta;
    
    history.push({
      timestamp: Date.now(),
      balance: newBalance
    });
    
    // Keep only last 1000 points
    if (history.length > 1000) {
      history.shift();
    }
    await saveBalanceHistory(history);
    // Notify popup of balance update
    chrome.runtime.sendMessage({ type: 'balanceUpdate', history });
  }

  // Reset stats
  async function resetStats() {
    // Record current profit as balance delta before reset
    const profitDelta = state.totalProfit;
    if (profitDelta !== 0) {
      await addBalancePoint(profitDelta);
    }
    
    state.currentStep = 1;
    state.wins = 0;
    state.losses = 0;
    state.totalProfit = 0;
    state.lastResultValue = null;
    lastKnownResult = null;
    saveState();
    log('🔄 Stats reset! Starting fresh.', 'info');
  }

  // Check profit thresholds and auto reset/restart if needed
  async function checkProfitThresholds() {
    if (state.totalProfit > PROFIT_THRESHOLD || state.totalProfit < -LOSS_THRESHOLD) {
      const reason = state.totalProfit > PROFIT_THRESHOLD ? `profit exceeded +$${PROFIT_THRESHOLD}` : `loss exceeded -$${LOSS_THRESHOLD}`;
      log(`💰 Auto-reset triggered: ${reason} ($${state.totalProfit.toFixed(2)})`, 'info');
      
      // Save current settings before stopping
      const savedBetDelay = state.betDelay;
      const savedTestMode = state.testMode;
      
      // Stop the bot
      stopBot();
      
      // Reset stats (this will record the balance)
      await resetStats();
      
      // Small delay before restarting
      setTimeout(() => {
        log('🔄 Auto-restarting bot after reset...', 'info');
        startBot(savedBetDelay, savedTestMode);
      }, 1000);
      
      return true; // Indicates auto-reset was triggered
    }
    return false;
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'start':
        startBot(message.betDelay || 1000, message.testMode || false);
        sendResponse({ success: true });
        break;
      case 'stop':
        stopBot();
        sendResponse({ success: true });
        break;
      case 'reset':
        resetStats().then(() => {
          sendResponse({ success: true });
        });
        return true; // Keep channel open for async
      case 'getBalanceHistory':
        loadBalanceHistory().then(history => {
          sendResponse({ success: true, history });
        });
        return true; // Keep channel open for async
      case 'clearBalanceHistory':
        saveBalanceHistory([]).then(() => {
          chrome.runtime.sendMessage({ type: 'balanceUpdate', history: [] });
          sendResponse({ success: true });
        });
        return true; // Keep channel open for async
      case 'getState':
        sendResponse({ success: true, state });
        break;
      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
    return true; // Keep message channel open for async response
  });

  // Initialize
  loadState().then(() => {
    console.log('[Limbo Bot] Initialized and ready!');
    console.log('[Limbo Bot] Win condition: Result >= 2.0x');
    
    // Create floating indicator
    const indicator = document.createElement('div');
    indicator.id = 'limbo-bot-indicator';
    indicator.innerHTML = '🤖 Bot Ready';
    indicator.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(26, 26, 46, 0.95);
      color: #00d4ff;
      padding: 10px 16px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: bold;
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      border: 2px solid #7c3aed;
      box-shadow: 0 4px 20px rgba(124, 58, 237, 0.4);
      min-width: 180px;
      text-align: center;
    `;
    document.body.appendChild(indicator);
    
    // Update indicator based on bot state
    const updateIndicator = () => {
      const profitColor = state.totalProfit >= 0 ? '#22c55e' : '#ef4444';
      const profitSign = state.totalProfit >= 0 ? '+' : '';
      
      const safeStepIndex = Math.max(0, Math.min(state.currentStep - 1, BET_SEQUENCE.length - 1));
      const nextBet = state.testMode ? 0.01 : BET_SEQUENCE[safeStepIndex];
      const modeLabel = state.testMode ? '🧪 TEST MODE' : '🤖 RUNNING';
      
      if (state.isRunning) {
        indicator.innerHTML = `
          <div style="margin-bottom:4px;">${modeLabel}</div>
          <div style="font-size:11px;color:#aaa;">
            Step ${state.currentStep}/${BET_SEQUENCE.length} | Next: $${nextBet}
          </div>
          <div style="font-size:11px;margin-top:4px;">
            W:<span style="color:#22c55e">${state.wins}</span> 
            L:<span style="color:#ef4444">${state.losses}</span> 
            <span style="color:${profitColor}">${profitSign}$${state.totalProfit.toFixed(2)}</span>
          </div>
        `;
        indicator.style.borderColor = state.testMode ? '#f59e0b' : '#22c55e';
        indicator.style.background = state.testMode ? 'rgba(46, 36, 16, 0.95)' : 'rgba(26, 46, 26, 0.95)';
      } else {
        const safeStepIndex = Math.max(0, Math.min(state.currentStep - 1, BET_SEQUENCE.length - 1));
        indicator.innerHTML = `
          <div style="margin-bottom:4px;">🤖 READY</div>
          <div style="font-size:11px;color:#aaa;">
            Step ${state.currentStep}/${BET_SEQUENCE.length} | Next: $${BET_SEQUENCE[safeStepIndex]}
          </div>
          <div style="font-size:11px;margin-top:4px;">
            W:<span style="color:#22c55e">${state.wins}</span> 
            L:<span style="color:#ef4444">${state.losses}</span>
            <span style="color:${profitColor}">${profitSign}$${state.totalProfit.toFixed(2)}</span>
          </div>
        `;
        indicator.style.borderColor = '#7c3aed';
        indicator.style.background = 'rgba(26, 26, 46, 0.95)';
      }
    };
    
    setInterval(updateIndicator, 300);
    
    // Initial check for elements
    setTimeout(() => {
      const input = findAmountInput();
      const button = findBetButton();
      console.log('[Limbo Bot] Amount input found:', !!input);
      console.log('[Limbo Bot] Bet button found:', !!button);
    }, 1000);
  });
})();

