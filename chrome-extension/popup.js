/**
 * Popup Script
 * Displays quick stats and controls
 */

// State
let isTracking = true;
let currentPlatform = null;
let connectionStatus = 'disconnected';

// Initialize popup
async function init() {
  try {
    // Get current tab info
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];

    if (currentTab) {
      // Detect platform
      currentPlatform = detectPlatform(currentTab.url);
      updatePlatformDisplay();
    }

    // Get connection status from background
    const response = await chrome.runtime.sendMessage({ type: 'get_status' });

    if (response) {
      connectionStatus = response.connected ? 'connected' : 'disconnected';
      isTracking = response.tracking !== false;

      updateConnectionStatus();
      updateTrackingButton();
    }

    // Get today's stats
    const stats = await getTodayStats();
    updateStats(stats);

    // Show content
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';

  } catch (err) {
    console.error('Failed to initialize popup:', err);
    showError();
  }
}

/**
 * Detect LLM platform from URL
 */
function detectPlatform(url) {
  if (!url) return null;

  if (url.includes('chat.openai.com') || url.includes('chatgpt.com')) {
    return 'ChatGPT';
  } else if (url.includes('claude.ai')) {
    return 'Claude';
  } else if (url.includes('gemini.google.com')) {
    return 'Gemini';
  }

  return null;
}

/**
 * Update platform display
 */
function updatePlatformDisplay() {
  const platformElement = document.getElementById('current-platform');

  if (currentPlatform) {
    platformElement.textContent = currentPlatform;
    platformElement.style.fontWeight = '600';
  } else {
    platformElement.textContent = 'Not on LLM platform';
    platformElement.style.opacity = '0.6';
  }
}

/**
 * Update connection status display
 */
function updateConnectionStatus() {
  const statusElement = document.getElementById('connection-status');

  if (connectionStatus === 'connected') {
    statusElement.className = 'status-badge badge-connected';
    statusElement.innerHTML = '<span class="icon icon-green"></span> Connected';
  } else {
    statusElement.className = 'status-badge badge-disconnected';
    statusElement.innerHTML = '<span class="icon icon-red"></span> Disconnected';
  }
}

/**
 * Update tracking button
 */
function updateTrackingButton() {
  const button = document.getElementById('toggle-tracking');

  if (isTracking) {
    button.textContent = 'Pause Tracking';
  } else {
    button.textContent = 'Resume Tracking';
  }
}

/**
 * Get today's stats from storage
 */
async function getTodayStats() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const key = `stats_${today}`;

    const result = await chrome.storage.local.get(key);

    return result[key] || { messages: 0, tokens: 0 };
  } catch (err) {
    console.error('Failed to get stats:', err);
    return { messages: 0, tokens: 0 };
  }
}

/**
 * Update stats display
 */
function updateStats(stats) {
  document.getElementById('messages-today').textContent = stats.messages || 0;

  const tokens = stats.tokens || 0;
  document.getElementById('tokens-today').textContent =
    tokens > 1000 ? `${(tokens / 1000).toFixed(1)}K` : tokens;
}

/**
 * Show error state
 */
function showError() {
  document.getElementById('loading').innerHTML = `
    <div style="text-align: center; padding: 20px;">
      <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
      <div style="font-weight: 600; margin-bottom: 8px;">Unable to Load</div>
      <div style="opacity: 0.8; font-size: 12px;">Please refresh the page</div>
    </div>
  `;
}

// Event Listeners
document.addEventListener('DOMContentLoaded', init);

document.getElementById('open-dashboard')?.addEventListener('click', async () => {
  try {
    await chrome.runtime.sendMessage({ type: 'open_dashboard' });
    window.close();
  } catch (err) {
    console.error('Failed to open dashboard:', err);
  }
});

document.getElementById('toggle-tracking')?.addEventListener('click', async () => {
  try {
    isTracking = !isTracking;

    await chrome.runtime.sendMessage({
      type: 'toggle_tracking',
      enabled: isTracking
    });

    updateTrackingButton();

    // Show feedback
    const button = document.getElementById('toggle-tracking');
    const originalText = button.textContent;
    button.textContent = isTracking ? '✓ Tracking Resumed' : '✓ Tracking Paused';
    setTimeout(() => {
      updateTrackingButton();
    }, 1500);

  } catch (err) {
    console.error('Failed to toggle tracking:', err);
  }
});

// Listen for updates from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'stats_updated') {
    updateStats(message.stats);
  } else if (message.type === 'connection_status') {
    connectionStatus = message.connected ? 'connected' : 'disconnected';
    updateConnectionStatus();
  }
});
