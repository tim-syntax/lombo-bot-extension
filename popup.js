// Get constants from global object (loaded via constants.js)
const { BET_SEQUENCE, PAYOUT_SEQUENCE } = window.LimboBotConstants || {};

// DOM Elements
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const currentStepEl = document.getElementById('currentStep');
const winsEl = document.getElementById('wins');
const lossesEl = document.getElementById('losses');
const nextBetEl = document.getElementById('nextBet');
const profitEl = document.getElementById('profit');
const betDelayInput = document.getElementById('betDelay');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');
const logContainer = document.getElementById('logContainer');
const stepElements = document.querySelectorAll('.step');

// Log cache to store all log entries
let logCache = [];

// Load saved state
async function loadState() {
  const result = await chrome.storage.local.get(['botState', 'betDelay']);
  
  if (result.botState) {
    updateUI(result.botState);
    previousIsRunning = result.botState.isRunning || false;
  }
  
  if (result.betDelay) {
    betDelayInput.value = result.betDelay;
  }
}

// Update UI with state
function updateUI(state) {
  currentStepEl.textContent = state.currentStep;
  winsEl.textContent = state.wins;
  lossesEl.textContent = state.losses;
  
  // Show next bet and payout
  const nextBet = BET_SEQUENCE[state.currentStep - 1];
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
    statusText.textContent = 'Running';
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
  const timestamp = new Date();
  const timeString = timestamp.toLocaleTimeString();
  const dateString = timestamp.toLocaleDateString();
  
  // Create log entry object for cache
  const logEntry = {
    timestamp: timestamp.toISOString(),
    date: dateString,
    time: timeString,
    message: message,
    type: type
  };
  
  // Add to cache
  logCache.push(logEntry);
  
  // Display in UI
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${timeString}] ${message}`;
  logContainer.insertBefore(entry, logContainer.firstChild);
  
  // Keep only last 50 entries in UI
  while (logContainer.children.length > 50) {
    logContainer.removeChild(logContainer.lastChild);
  }
}

// Save logs to file
async function saveLogsToFile() {
  if (logCache.length === 0) {
    return;
  }
  
  try {
    // Create filename with timestamp
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, -5); // Format: 2024-01-15T10-30-45
    const filename = `limbo-bot-log-${dateStr}.txt`;
    
    // Format log content
    let logContent = `BC.Game Limbo Bot - Activity Log\n`;
    logContent += `Generated: ${now.toLocaleString()}\n`;
    logContent += `Total Entries: ${logCache.length}\n`;
    logContent += `${'='.repeat(60)}\n\n`;
    
    // Add all log entries (oldest first)
    logCache.forEach(entry => {
      const typeLabel = entry.type.toUpperCase().padEnd(6);
      logContent += `[${entry.date} ${entry.time}] [${typeLabel}] ${entry.message}\n`;
    });
    
    logContent += `\n${'='.repeat(60)}\n`;
    logContent += `End of Log\n`;
    
    // Create blob and download
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false
    });
    
    // Clean up
    URL.revokeObjectURL(url);
    
    addLog(`📄 Log file saved: ${filename}`, 'info');
  } catch (error) {
    console.error('Error saving log file:', error);
    addLog('❌ Failed to save log file', 'lose');
  }
}

// Clear log cache (called on reset)
function clearLogCache() {
  logCache = [];
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
  const betDelay = parseInt(betDelayInput.value) || 1000;
  await chrome.storage.local.set({ betDelay });
  
  const response = await sendToContent('start', { betDelay, testMode: false });
  
  if (response && response.success) {
    addLog('Bot started!', 'info');
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusIndicator.classList.add('running');
    statusText.textContent = 'Running';
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
    
    // Save logs to file when bot stops
    await saveLogsToFile();
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
    
    // Clear log cache on reset
    clearLogCache();
  }
});

// Track previous running state to detect when bot stops
let previousIsRunning = false;

// Listen for state updates from content script
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'stateUpdate') {
    const wasRunning = previousIsRunning;
    const isRunning = message.state.isRunning;
    previousIsRunning = isRunning;
    
    updateUI(message.state);
    
    // If bot was running and now stopped, save logs
    if (wasRunning && !isRunning) {
      await saveLogsToFile();
    }
  } else if (message.type === 'log') {
    addLog(message.message, message.logType);
  }
  sendResponse({ received: true });
});

// Initialize
loadState();

// Highlight first step by default
stepElements[0].classList.add('active');

