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
const exportLogBtn = document.getElementById('exportLogBtn');
const cycleResetBtn = document.getElementById('cycleResetBtn');
const totalDeltaEl = document.getElementById('totalDelta');
const chartCanvas = document.getElementById('balanceChart');
const stepElements = document.querySelectorAll('.step');

// Log cache to store all log entries
let logCache = [];
let balanceHistory = [];
let chartContext = null;

// Initialize chart
function initChart() {
  if (!chartCanvas) return;
  
  chartContext = chartCanvas.getContext('2d');
  
  // Set canvas size
  const updateCanvasSize = () => {
    const rect = chartCanvas.getBoundingClientRect();
    chartCanvas.width = rect.width;
    chartCanvas.height = 200;
    drawChart();
  };
  
  updateCanvasSize();
  
  // Update on resize
  window.addEventListener('resize', updateCanvasSize);
}

// Draw chart
function drawChart() {
  if (!chartContext || balanceHistory.length === 0) {
    // Draw empty chart
    chartContext.fillStyle = 'rgba(0, 0, 0, 0.2)';
    chartContext.fillRect(0, 0, chartCanvas.width, chartCanvas.height);
    chartContext.fillStyle = '#888';
    chartContext.font = '12px sans-serif';
    chartContext.textAlign = 'center';
    chartContext.fillText('No balance data yet', chartCanvas.width / 2, chartCanvas.height / 2);
    return;
  }

  const padding = 40;
  const chartWidth = chartCanvas.width - padding * 2;
  const chartHeight = chartCanvas.height - padding * 2;
  
  // Clear canvas
  chartContext.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
  
  // Find min/max for scaling
  const balances = balanceHistory.map(h => h.balance);
  const minBalance = Math.min(...balances);
  const maxBalance = Math.max(...balances);
  const range = maxBalance - minBalance || 1; // Avoid division by zero
  
  // Draw background
  chartContext.fillStyle = 'rgba(0, 0, 0, 0.2)';
  chartContext.fillRect(padding, padding, chartWidth, chartHeight);
  
  // Draw grid lines
  chartContext.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  chartContext.lineWidth = 1;
  
  // Horizontal grid lines
  for (let i = 0; i <= 5; i++) {
    const y = padding + (chartHeight / 5) * i;
    chartContext.beginPath();
    chartContext.moveTo(padding, y);
    chartContext.lineTo(padding + chartWidth, y);
    chartContext.stroke();
    
    // Y-axis labels
    const value = maxBalance - (range / 5) * i;
    chartContext.fillStyle = '#888';
    chartContext.font = '10px sans-serif';
    chartContext.textAlign = 'right';
    chartContext.fillText(value.toFixed(2), padding - 8, y + 4);
  }
  
  // Draw line
  chartContext.strokeStyle = '#00d4ff';
  chartContext.lineWidth = 2;
  chartContext.beginPath();
  
  balanceHistory.forEach((point, index) => {
    const x = padding + (chartWidth / (balanceHistory.length - 1 || 1)) * index;
    const y = padding + chartHeight - ((point.balance - minBalance) / range) * chartHeight;
    
    if (index === 0) {
      chartContext.moveTo(x, y);
    } else {
      chartContext.lineTo(x, y);
    }
  });
  
  chartContext.stroke();
  
  // Draw points
  chartContext.fillStyle = '#00d4ff';
  balanceHistory.forEach((point, index) => {
    const x = padding + (chartWidth / (balanceHistory.length - 1 || 1)) * index;
    const y = padding + chartHeight - ((point.balance - minBalance) / range) * chartHeight;
    
    chartContext.beginPath();
    chartContext.arc(x, y, 3, 0, Math.PI * 2);
    chartContext.fill();
  });
  
  // Draw X-axis label
  chartContext.fillStyle = '#888';
  chartContext.font = '10px sans-serif';
  chartContext.textAlign = 'center';
  chartContext.fillText('Balance History', chartCanvas.width / 2, chartCanvas.height - 8);
}

// Update total delta display
function updateTotalDelta() {
  let totalDelta = 0;
  if (balanceHistory.length > 0) {
    // Total delta is the last balance point in history
    totalDelta = balanceHistory[balanceHistory.length - 1].balance;
  }
  
  const deltaSign = totalDelta >= 0 ? '+' : '';
  totalDeltaEl.textContent = deltaSign + '$' + totalDelta.toFixed(2);
  totalDeltaEl.className = 'stat-value ' + (totalDelta >= 0 ? 'win' : 'lose');
}

// Load balance history
async function loadBalanceHistory() {
  const response = await sendToContent('getBalanceHistory');
  if (response && response.success) {
    balanceHistory = response.history || [];
    drawChart();
    updateTotalDelta();
  }
}

// Clear balance history (cycle reset)
async function clearBalanceHistory() {
  const response = await sendToContent('clearBalanceHistory');
  if (response && response.success) {
    balanceHistory = [];
    drawChart();
    updateTotalDelta();
    addLog('Cycle reset - balance history cleared', 'info');
  }
}

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
  
  // Load balance history
  await loadBalanceHistory();
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
  
  // Update total delta (from balance history)
  updateTotalDelta();
  
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

// Add log entry (for export only, not displayed)
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
  
  // Keep only last 10000 entries
  if (logCache.length > 10000) {
    logCache.shift();
  }
}

// Save logs to file
async function saveLogsToFile() {
  if (logCache.length === 0) {
    alert('No logs to export');
    return;
  }
  
  try {
    // Create filename with timestamp
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
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
      saveAs: true
    });
    
    // Clean up
    URL.revokeObjectURL(url);
    
    addLog(`📄 Log file saved: ${filename}`, 'info');
  } catch (error) {
    console.error('Error saving log file:', error);
    alert('Failed to save log file. Make sure downloads permission is granted.');
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
    console.log('Please navigate to BC.Game Limbo page!');
    return null;
  }
  
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action, ...data });
    return response;
  } catch (error) {
    console.log('Error communicating with page. Refresh the page.', error);
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
    
    // Reload balance history to update chart
    await loadBalanceHistory();
  }
});

// Export log button
exportLogBtn.addEventListener('click', async () => {
  await saveLogsToFile();
});

// Cycle reset button
cycleResetBtn.addEventListener('click', async () => {
  await clearBalanceHistory();
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
  } else if (message.type === 'log') {
    addLog(message.message, message.logType);
  } else if (message.type === 'balanceUpdate') {
    balanceHistory = message.history || [];
    drawChart();
    updateTotalDelta();
  }
  sendResponse({ received: true });
});


// Initialize
loadState();
initChart();

// Highlight first step by default
stepElements[0].classList.add('active');
