// Bet amounts for each step
const BET_SEQUENCE = [0.01, 0.01, 0.01, 0.04, 0.1, 0.2, 0.4, 1, 2, 4, 10, 20, 40];
const PAYOUT_SEQUENCE = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];

// DOM Elements
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const currentStepEl = document.getElementById('currentStep');
const winsEl = document.getElementById('wins');
const lossesEl = document.getElementById('losses');
const nextBetEl = document.getElementById('nextBet');
const profitEl = document.getElementById('profit');
const testModeCheckbox = document.getElementById('testMode');
const betDelayInput = document.getElementById('betDelay');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');
const logContainer = document.getElementById('logContainer');
const stepElements = document.querySelectorAll('.step');

// Load saved state
async function loadState() {
  const result = await chrome.storage.local.get(['botState', 'betDelay', 'testMode']);
  
  if (result.botState) {
    updateUI(result.botState);
  }
  
  if (result.betDelay) {
    betDelayInput.value = result.betDelay;
  }
  
  if (result.testMode !== undefined) {
    testModeCheckbox.checked = result.testMode;
  }
}

// Update UI with state
function updateUI(state) {
  currentStepEl.textContent = state.currentStep;
  winsEl.textContent = state.wins;
  lossesEl.textContent = state.losses;
  
  // Show next bet and payout (0.01 in test mode)
  const nextBet = state.testMode ? 0.01 : BET_SEQUENCE[state.currentStep - 1];
  const nextPayout = PAYOUT_SEQUENCE[state.currentStep - 1];
  nextBetEl.textContent = '$' + nextBet + ' @ ' + nextPayout + 'x';
  
  // Update profit display
  const profit = state.totalProfit || 0;
  const profitSign = profit >= 0 ? '+' : '';
  profitEl.textContent = profitSign + '$' + profit.toFixed(2);
  profitEl.className = 'stat-value ' + (profit >= 0 ? 'win' : 'lose');
  
  // Update step indicators
  stepElements.forEach((el, index) => {
    el.classList.toggle('active', index === state.currentStep - 1);
  });
  
  // Update running status
  if (state.isRunning) {
    statusIndicator.classList.add('running');
    statusText.textContent = state.testMode ? 'Testing' : 'Running';
    startBtn.disabled = true;
    stopBtn.disabled = false;
  } else {
    statusIndicator.classList.remove('running');
    statusText.textContent = 'Stopped';
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

// Add log entry
function addLog(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logContainer.insertBefore(entry, logContainer.firstChild);
  
  // Keep only last 50 entries
  while (logContainer.children.length > 50) {
    logContainer.removeChild(logContainer.lastChild);
  }
}

// Send message to content script
async function sendToContent(action, data = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab || !tab.url.includes('bc.game/game/limbo')) {
    addLog('Please navigate to BC.Game Limbo page!', 'lose');
    return null;
  }
  
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action, ...data });
    return response;
  } catch (error) {
    addLog('Error communicating with page. Refresh the page.', 'lose');
    return null;
  }
}

// Start bot
startBtn.addEventListener('click', async () => {
  const betDelay = parseInt(betDelayInput.value) || 2000;
  const testMode = testModeCheckbox.checked;
  await chrome.storage.local.set({ betDelay, testMode });
  
  const response = await sendToContent('start', { betDelay, testMode });
  
  if (response && response.success) {
    addLog(testMode ? '🧪 Bot started in TEST MODE ($0.01 only)' : 'Bot started!', 'info');
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusIndicator.classList.add('running');
    statusText.textContent = testMode ? 'Testing' : 'Running';
  }
});

// Stop bot
stopBtn.addEventListener('click', async () => {
  const response = await sendToContent('stop');
  
  if (response && response.success) {
    addLog('Bot stopped!', 'info');
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusIndicator.classList.remove('running');
    statusText.textContent = 'Stopped';
  }
});

// Reset stats
resetBtn.addEventListener('click', async () => {
  const response = await sendToContent('reset');
  
  if (response && response.success) {
    addLog('Stats reset!', 'info');
    currentStepEl.textContent = '1';
    winsEl.textContent = '0';
    lossesEl.textContent = '0';
    nextBetEl.textContent = '$0.01 @ 2x';
    profitEl.textContent = '$0.00';
    profitEl.className = 'stat-value';
    stepElements.forEach((el, index) => {
      el.classList.toggle('active', index === 0);
    });
  }
});

// Listen for state updates from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'stateUpdate') {
    updateUI(message.state);
  } else if (message.type === 'log') {
    addLog(message.message, message.logType);
  }
  sendResponse({ received: true });
});

// Initialize
loadState();

// Highlight first step by default
stepElements[0].classList.add('active');

