// background.js - Chrome Extension Background Service Worker
// Handles API interception, data storage, and native messaging

import { v4 as uuidv4 } from './lib/uuid.js';

// ============================================================================
// Configuration
// ============================================================================

const LLM_ENDPOINTS = {
  chatgpt: [
    'https://chat.openai.com/backend-api/*',
    'https://chatgpt.com/backend-api/*',
    'https://api.openai.com/v1/chat/completions'
  ],
  claude: [
    'https://claude.ai/api/*/chat_conversations/*',
    'https://api.anthropic.com/v1/messages'
  ],
  gemini: [
    'https://gemini.google.com/api/*',
    'https://generativelanguage.googleapis.com/*'
  ]
};

const ALL_ENDPOINTS = Object.values(LLM_ENDPOINTS).flat();

// ============================================================================
// State Management
// ============================================================================

class StateManager {
  constructor() {
    this.activeConversations = new Map();
    this.pendingRequests = new Map();
    this.nativePort = null;
    this.isConnected = false;
    this.isTracking = true;
    this.reconnectTimeout = null;
  }

  async init() {
    await this.loadState();
    this.connectToNativeApp();
    this.setupMessageHandlers();
  }

  async loadState() {
    const data = await chrome.storage.local.get([
      'activeConversations',
      'settings',
      'isTracking'
    ]);

    if (data.activeConversations) {
      this.activeConversations = new Map(
        Object.entries(data.activeConversations)
      );
    }

    if (data.isTracking !== undefined) {
      this.isTracking = data.isTracking;
    }
  }

  async saveState() {
    await chrome.storage.local.set({
      activeConversations: Object.fromEntries(this.activeConversations)
    });
  }

  connectToNativeApp() {
    try {
      this.nativePort = chrome.runtime.connectNative(
        'com.llmtracker.nativehost'
      );
      
      this.nativePort.onMessage.addListener((msg) => {
        this.handleNativeMessage(msg);
      });
      
      this.nativePort.onDisconnect.addListener(() => {
        console.log('Native app disconnected:', chrome.runtime.lastError);
        this.isConnected = false;
        this.scheduleReconnect();
      });
      
      this.isConnected = true;
      console.log('Connected to native app');
      
      // Send initial sync
      this.sendToNativeApp({
        type: 'INIT',
        data: { extensionVersion: chrome.runtime.getManifest().version }
      });
      
    } catch (error) {
      console.error('Failed to connect to native app:', error);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    this.reconnectTimeout = setTimeout(() => {
      console.log('Attempting to reconnect to native app...');
      this.connectToNativeApp();
    }, 5000);
  }

  sendToNativeApp(message) {
    if (this.isConnected && this.nativePort) {
      try {
        this.nativePort.postMessage(message);
      } catch (error) {
        console.error('Error sending to native app:', error);
        this.isConnected = false;
      }
    }
  }

  handleNativeMessage(message) {
    console.log('Received from native app:', message);
    
    switch (message.type) {
      case 'SUGGESTION':
        this.broadcastToContentScripts(message);
        break;
      case 'REQUEST_SYNC':
        this.syncAllData();
        break;
      case 'PING':
        this.sendToNativeApp({ type: 'PONG' });
        break;
    }
  }

  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleExtensionMessage(message, sender)
        .then(sendResponse)
        .catch(error => {
          console.error('Error handling message:', error);
          sendResponse({ error: error.message });
        });
      return true; // Will respond asynchronously
    });
  }

  async handleExtensionMessage(message, sender) {
    switch (message.type) {
      case 'MESSAGE_CAPTURED':
        return await this.handleMessageCapture(message.data, sender);
      case 'API_CAPTURED':
        return await this.handleApiCapture(message.data);
      case 'GET_STATUS':
      case 'get_status':
        return {
          connected: this.isConnected,
          tracking: this.isTracking !== false
        };
      case 'GET_STATS':
        return await this.getStats();
      case 'toggle_tracking':
        this.isTracking = message.enabled;
        await chrome.storage.local.set({ isTracking: this.isTracking });
        return { success: true, tracking: this.isTracking };
      case 'open_dashboard':
        // Send message to native app to open dashboard
        this.sendToNativeApp({ type: 'OPEN_DASHBOARD' });
        return { success: true };
      default:
        console.warn('Unknown message type:', message.type);
        return { success: false };
    }
  }

  async broadcastToContentScripts(message) {
    const tabs = await chrome.tabs.query({ url: ALL_ENDPOINTS });
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {
        // Tab might not have content script injected yet
      });
    });
  }

  async handleMessageCapture(data, sender) {
    const messageId = uuidv4();
    const conversationId = data.conversationId || this.getConversationId(sender.tab);
    
    // Store in extension storage
    const message = {
      id: messageId,
      conversationId,
      timestamp: Date.now(),
      ...data
    };
    
    await this.storeMessage(message);
    
    // Send to native app
    this.sendToNativeApp({
      type: 'MESSAGE_STORED',
      data: message
    });
    
    return { success: true, messageId };
  }

  async handleApiCapture(data) {
    const captureId = uuidv4();
    
    const capture = {
      id: captureId,
      timestamp: Date.now(),
      ...data
    };
    
    // Extract and store system prompts
    await this.extractSystemPrompts(capture);
    
    // Store API capture
    await this.storeApiCapture(capture);
    
    // Send to native app
    this.sendToNativeApp({
      type: 'API_CAPTURED',
      data: capture
    });
    
    return { success: true, captureId };
  }

  async extractSystemPrompts(capture) {
    const { platform, requestBody } = capture;
    
    let systemPrompts = [];
    
    if (platform === 'chatgpt' && requestBody.messages) {
      systemPrompts = requestBody.messages
        .filter(m => m.role === 'system')
        .map(m => m.content);
    } else if (platform === 'claude') {
      if (requestBody.system) {
        systemPrompts.push(requestBody.system);
      }
      if (requestBody.messages) {
        systemPrompts.push(
          ...requestBody.messages
            .filter(m => m.role === 'system')
            .map(m => m.content)
        );
      }
    } else if (platform === 'gemini' && requestBody.systemInstruction) {
      systemPrompts.push(
        requestBody.systemInstruction.parts?.[0]?.text || 
        requestBody.systemInstruction
      );
    }
    
    // Store system prompts
    for (const prompt of systemPrompts) {
      if (prompt && prompt.trim()) {
        await this.storeSystemPrompt({
          platform,
          promptText: prompt,
          timestamp: Date.now(),
          conversationId: capture.conversationId
        });
      }
    }
  }

  async storeMessage(message) {
    const key = `message_${message.id}`;
    await chrome.storage.local.set({ [key]: message });
    
    // Update conversation
    const conv = this.activeConversations.get(message.conversationId) || {
      id: message.conversationId,
      messages: [],
      startTime: Date.now()
    };
    
    conv.messages.push(message.id);
    conv.lastActivity = Date.now();
    
    this.activeConversations.set(message.conversationId, conv);
    await this.saveState();
  }

  async storeApiCapture(capture) {
    const key = `api_${capture.id}`;
    await chrome.storage.local.set({ [key]: capture });
  }

  async storeSystemPrompt(data) {
    // Generate hash for deduplication
    const hash = await this.hashString(data.promptText);
    const key = `sysprompt_${hash}`;
    
    const existing = await chrome.storage.local.get(key);
    
    if (existing[key]) {
      // Update occurrence count
      existing[key].occurrenceCount++;
      existing[key].lastSeen = data.timestamp;
      await chrome.storage.local.set({ [key]: existing[key] });
    } else {
      // New system prompt
      await chrome.storage.local.set({
        [key]: {
          hash,
          platform: data.platform,
          promptText: data.promptText,
          firstSeen: data.timestamp,
          lastSeen: data.timestamp,
          occurrenceCount: 1,
          conversationIds: [data.conversationId]
        }
      });
    }
  }

  async hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  getConversationId(tab) {
    // Extract conversation ID from URL or generate one
    const url = new URL(tab.url);
    const pathParts = url.pathname.split('/');
    
    // Platform-specific ID extraction
    if (url.hostname.includes('openai.com') || url.hostname.includes('chatgpt.com')) {
      const chatId = pathParts.find(p => p.startsWith('c/'));
      return chatId || `chatgpt_${tab.id}_${Date.now()}`;
    } else if (url.hostname.includes('claude.ai')) {
      const chatId = pathParts[pathParts.length - 1];
      return chatId || `claude_${tab.id}_${Date.now()}`;
    } else if (url.hostname.includes('gemini.google.com')) {
      const chatId = url.searchParams.get('c');
      return chatId || `gemini_${tab.id}_${Date.now()}`;
    }
    
    return `unknown_${tab.id}_${Date.now()}`;
  }

  async getStats() {
    const conversations = Array.from(this.activeConversations.values());
    const totalMessages = conversations.reduce(
      (sum, conv) => sum + conv.messages.length, 
      0
    );
    
    return {
      activeConversations: conversations.length,
      totalMessages,
      nativeAppConnected: this.isConnected
    };
  }

  async syncAllData() {
    // Get all stored data and send to native app
    const allData = await chrome.storage.local.get(null);
    
    this.sendToNativeApp({
      type: 'FULL_SYNC',
      data: allData
    });
  }
}

// ============================================================================
// Request Interception
// ============================================================================

class RequestInterceptor {
  constructor(stateManager) {
    this.state = stateManager;
    this.requestMap = new Map();
    this.setupInterception();
  }

  setupInterception() {
    // Capture request bodies
    chrome.webRequest.onBeforeRequest.addListener(
      (details) => this.handleRequest(details),
      { urls: ALL_ENDPOINTS },
      ['requestBody']
    );

    // Capture request headers
    chrome.webRequest.onBeforeSendHeaders.addListener(
      (details) => this.handleRequestHeaders(details),
      { urls: ALL_ENDPOINTS },
      ['requestHeaders', 'extraHeaders']
    );

    // Capture response headers
    chrome.webRequest.onResponseStarted.addListener(
      (details) => this.handleResponseHeaders(details),
      { urls: ALL_ENDPOINTS },
      ['responseHeaders']
    );

    // Capture completed requests
    chrome.webRequest.onCompleted.addListener(
      (details) => this.handleResponse(details),
      { urls: ALL_ENDPOINTS },
      ['responseHeaders']
    );
  }

  handleRequest(details) {
    const platform = this.detectPlatform(details.url);
    
    let requestBody = null;
    if (details.requestBody) {
      requestBody = this.parseRequestBody(details.requestBody);
    }
    
    this.requestMap.set(details.requestId, {
      requestId: details.requestId,
      platform,
      url: details.url,
      method: details.method,
      timestamp: Date.now(),
      requestBody
    });
  }

  handleRequestHeaders(details) {
    const request = this.requestMap.get(details.requestId);
    if (request) {
      // Redact sensitive headers
      request.requestHeaders = this.sanitizeHeaders(details.requestHeaders);
    }
  }

  handleResponseHeaders(details) {
    const request = this.requestMap.get(details.requestId);
    if (request) {
      request.responseHeaders = details.responseHeaders;
      request.statusCode = details.statusCode;
    }
  }

  async handleResponse(details) {
    const request = this.requestMap.get(details.requestId);
    if (!request) return;
    
    // For non-streaming responses, we capture here
    // Streaming responses are captured via fetch interception in content script
    
    const isStreaming = this.isStreamingResponse(request.responseHeaders);
    
    if (!isStreaming) {
      // Store the complete request/response
      await this.state.handleApiCapture({
        ...request,
        responseTime: Date.now() - request.timestamp,
        streaming: false
      });
    } else {
      // Mark as streaming, content script will handle chunks
      await this.state.handleApiCapture({
        ...request,
        streaming: true,
        streamingInProgress: true
      });
    }
    
    // Cleanup
    this.requestMap.delete(details.requestId);
  }

  detectPlatform(url) {
    if (url.includes('openai.com') || url.includes('chatgpt.com')) {
      return 'chatgpt';
    } else if (url.includes('claude.ai') || url.includes('anthropic.com')) {
      return 'claude';
    } else if (url.includes('gemini.google.com') || url.includes('generativelanguage.googleapis.com')) {
      return 'gemini';
    }
    return 'unknown';
  }

  parseRequestBody(requestBody) {
    if (!requestBody) return null;
    
    try {
      if (requestBody.raw) {
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(requestBody.raw[0].bytes);
        return JSON.parse(text);
      } else if (requestBody.formData) {
        return Object.fromEntries(
          Object.entries(requestBody.formData).map(
            ([k, v]) => [k, v[0]]
          )
        );
      }
    } catch (error) {
      console.error('Error parsing request body:', error);
      return null;
    }
    
    return null;
  }

  sanitizeHeaders(headers) {
    const sensitive = ['authorization', 'cookie', 'api-key', 'x-api-key'];
    return headers.map(header => {
      if (sensitive.includes(header.name.toLowerCase())) {
        return { ...header, value: '[REDACTED]' };
      }
      return header;
    });
  }

  isStreamingResponse(headers) {
    if (!headers) return false;
    
    const contentType = headers.find(
      h => h.name.toLowerCase() === 'content-type'
    );
    
    return contentType?.value.includes('text/event-stream') ||
           contentType?.value.includes('application/stream+json');
  }
}

// ============================================================================
// Initialization
// ============================================================================

const stateManager = new StateManager();
const interceptor = new RequestInterceptor(stateManager);

chrome.runtime.onInstalled.addListener(async () => {
  console.log('LLM Tracker extension installed');
  await stateManager.init();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('LLM Tracker extension started');
  await stateManager.init();
});

// Initialize on load
stateManager.init();

// Keep service worker alive
chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // Ping native app
    stateManager.sendToNativeApp({ type: 'PING' });
  }
});

export { stateManager, interceptor };
