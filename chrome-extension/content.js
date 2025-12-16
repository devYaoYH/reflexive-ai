// content.js - Content Script for LLM Platform Pages
// Captures visible UI interactions and intercepts streaming responses

(function() {
  'use strict';

  // ============================================================================
  // Configuration
  // ============================================================================

  const PLATFORMS = {
    'chat.openai.com': 'chatgpt',
    'chatgpt.com': 'chatgpt',
    'claude.ai': 'claude',
    'gemini.google.com': 'gemini',
    'bard.google.com': 'gemini'
  };

  const platform = PLATFORMS[window.location.hostname];
  
  if (!platform) {
    console.log('LLM Tracker: Unknown platform');
    return;
  }

  console.log(`LLM Tracker: Initialized on ${platform}`);

  // ============================================================================
  // Fetch/XHR Interception for Streaming
  // ============================================================================

  class StreamInterceptor {
    constructor() {
      this.activeStreams = new Map();
      this.setupInterception();
    }

    setupInterception() {
      // Intercept fetch
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        const [url, options] = args;
        
        if (this.isLLMEndpoint(url)) {
          return this.interceptFetch(originalFetch, url, options);
        }
        
        return originalFetch.apply(window, args);
      };

      // Intercept XMLHttpRequest
      const originalXHROpen = XMLHttpRequest.prototype.open;
      const originalXHRSend = XMLHttpRequest.prototype.send;
      
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._llmTracker = {
          url: url,
          method: method,
          isLLMEndpoint: streamInterceptor.isLLMEndpoint(url)
        };
        return originalXHROpen.apply(this, [method, url, ...rest]);
      };

      XMLHttpRequest.prototype.send = function(body) {
        if (this._llmTracker?.isLLMEndpoint) {
          streamInterceptor.interceptXHR(this, body);
        }
        return originalXHRSend.apply(this, [body]);
      };
    }

    isLLMEndpoint(url) {
      const llmPatterns = [
        '/backend-api/',
        '/api/chat',
        '/api/conversation',
        'chat/completions',
        'messages',
        '/completion'
      ];
      
      return llmPatterns.some(pattern => 
        url.toString().includes(pattern)
      );
    }

    async interceptFetch(originalFetch, url, options) {
      const requestId = this.generateId();
      const requestBody = options?.body ? JSON.parse(options.body) : null;
      
      // Capture request
      this.captureRequest(requestId, {
        url,
        method: options?.method || 'GET',
        body: requestBody,
        headers: options?.headers
      });

      try {
        const response = await originalFetch(url, options);
        
        // Check if streaming
        const contentType = response.headers.get('content-type');
        const isStreaming = contentType?.includes('text/event-stream') ||
                           contentType?.includes('stream');
        
        if (isStreaming && response.body) {
          return this.captureStreamingResponse(requestId, response);
        } else {
          // Non-streaming response
          const clonedResponse = response.clone();
          clonedResponse.json().then(data => {
            this.captureCompleteResponse(requestId, data);
          }).catch(() => {});
          
          return response;
        }
      } catch (error) {
        console.error('Fetch interception error:', error);
        throw error;
      }
    }

    captureStreamingResponse(requestId, response) {
      const clonedResponse = response.clone();
      const reader = clonedResponse.body.getReader();
      const decoder = new TextDecoder();
      
      let chunkIndex = 0;
      let lastChunkTime = Date.now();
      let accumulatedContent = '';
      
      const stream = this.activeStreams.get(requestId) || {
        requestId,
        startTime: Date.now(),
        chunks: []
      };
      
      this.activeStreams.set(requestId, stream);

      // Read stream in background
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              this.finalizeStream(requestId, accumulatedContent);
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const now = Date.now();
            
            // Parse SSE format
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                
                if (data === '[DONE]') {
                  continue;
                }
                
                try {
                  const parsed = JSON.parse(data);
                  const content = this.extractContent(parsed);
                  
                  if (content) {
                    accumulatedContent += content;
                    
                    stream.chunks.push({
                      index: chunkIndex++,
                      timestamp: now,
                      deltaTime: now - lastChunkTime,
                      content: content,
                      raw: data
                    });
                    
                    lastChunkTime = now;
                    
                    // Send chunk to background
                    this.sendChunkToBackground(requestId, {
                      chunkIndex: chunkIndex - 1,
                      content,
                      deltaTime: now - lastChunkTime,
                      timestamp: now
                    });
                  }
                } catch (e) {
                  // Not JSON, might be raw text
                  if (data.trim()) {
                    accumulatedContent += data;
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error('Stream reading error:', error);
          this.activeStreams.delete(requestId);
        }
      })();

      return response;
    }

    extractContent(parsed) {
      // Platform-specific content extraction
      if (platform === 'chatgpt') {
        return parsed.choices?.[0]?.delta?.content || '';
      } else if (platform === 'claude') {
        return parsed.completion || parsed.delta?.text || '';
      } else if (platform === 'gemini') {
        return parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
      return '';
    }

    interceptXHR(xhr, body) {
      const requestId = this.generateId();
      
      this.captureRequest(requestId, {
        url: xhr._llmTracker.url,
        method: xhr._llmTracker.method,
        body: body ? JSON.parse(body) : null
      });

      const originalOnReadyStateChange = xhr.onreadystatechange;
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          try {
            const response = JSON.parse(xhr.responseText);
            streamInterceptor.captureCompleteResponse(requestId, response);
          } catch (e) {}
        }
        
        if (originalOnReadyStateChange) {
          originalOnReadyStateChange.apply(this, arguments);
        }
      };
    }

    captureRequest(requestId, data) {
      chrome.runtime.sendMessage({
        type: 'API_REQUEST_INTERCEPTED',
        data: {
          requestId,
          platform,
          timestamp: Date.now(),
          ...data
        }
      });
    }

    sendChunkToBackground(requestId, chunk) {
      chrome.runtime.sendMessage({
        type: 'STREAM_CHUNK',
        data: {
          requestId,
          platform,
          ...chunk
        }
      });
    }

    captureCompleteResponse(requestId, data) {
      chrome.runtime.sendMessage({
        type: 'API_RESPONSE_COMPLETE',
        data: {
          requestId,
          platform,
          timestamp: Date.now(),
          response: data
        }
      });
    }

    finalizeStream(requestId, fullContent) {
      const stream = this.activeStreams.get(requestId);
      
      if (stream) {
        chrome.runtime.sendMessage({
          type: 'STREAM_COMPLETE',
          data: {
            requestId,
            platform,
            timestamp: Date.now(),
            totalChunks: stream.chunks.length,
            fullContent,
            duration: Date.now() - stream.startTime,
            chunks: stream.chunks
          }
        });
        
        this.activeStreams.delete(requestId);
      }
    }

    generateId() {
      return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  // ============================================================================
  // DOM Observer for Visible Content
  // ============================================================================

  class ConversationObserver {
    constructor() {
      this.messageElements = new Map();
      this.conversationId = this.extractConversationId();
      this.lastMessageCount = 0;
      this.setupObserver();
      this.setupInitialCapture();
    }

    extractConversationId() {
      const url = window.location.href;
      
      if (platform === 'chatgpt') {
        const match = url.match(/\/c\/([^/?]+)/);
        return match ? match[1] : null;
      } else if (platform === 'claude') {
        const parts = url.split('/');
        return parts[parts.length - 1] || null;
      } else if (platform === 'gemini') {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('c');
      }
      
      return null;
    }

    setupObserver() {
      const observer = new MutationObserver((mutations) => {
        this.handleMutations(mutations);
      });

      // Start observing
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        characterDataOldValue: true
      });

      // Also observe for navigation changes
      this.observeNavigation();
    }

    observeNavigation() {
      let lastUrl = window.location.href;
      
      setInterval(() => {
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          this.conversationId = this.extractConversationId();
          this.messageElements.clear();
          this.setupInitialCapture();
        }
      }, 1000);
    }

    setupInitialCapture() {
      // Capture any existing messages on page load
      setTimeout(() => {
        this.captureExistingMessages();
      }, 2000);
    }

    captureExistingMessages() {
      const messages = this.findMessageElements();
      
      messages.forEach((msgElement, index) => {
        this.captureMessage(msgElement, index, true);
      });
    }

    findMessageElements() {
      // Platform-specific selectors
      const selectors = {
        chatgpt: '[data-message-author-role]',
        claude: '[data-test-render-count]',
        gemini: '.conversation-turn'
      };

      const selector = selectors[platform];
      if (!selector) return [];

      return Array.from(document.querySelectorAll(selector));
    }

    handleMutations(mutations) {
      for (const mutation of mutations) {
        // New messages added
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1 && this.isMessageNode(node)) {
              this.captureMessage(node);
            }
          });
        }

        // Message content updated (streaming)
        if (mutation.type === 'characterData' || mutation.type === 'childList') {
          const messageNode = this.findParentMessage(mutation.target);
          if (messageNode) {
            this.updateMessage(messageNode);
          }
        }
      }
    }

    isMessageNode(node) {
      const messageSelectors = {
        chatgpt: node.hasAttribute('data-message-author-role'),
        claude: node.hasAttribute('data-test-render-count'),
        gemini: node.classList.contains('conversation-turn')
      };

      return messageSelectors[platform] || false;
    }

    findParentMessage(node) {
      let current = node;
      while (current && current !== document.body) {
        if (this.isMessageNode(current)) {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    }

    captureMessage(element, position = null, isInitial = false) {
      const messageId = this.getElementId(element);
      
      const data = {
        messageId,
        conversationId: this.conversationId,
        platform,
        timestamp: Date.now(),
        role: this.detectRole(element),
        visibleContent: this.extractText(element),
        html: element.innerHTML,
        position: position ?? this.getMessagePosition(element),
        attachments: this.extractAttachments(element),
        codeBlocks: this.extractCodeBlocks(element),
        isInitial
      };

      this.messageElements.set(messageId, {
        element,
        data,
        lastContent: data.visibleContent
      });

      // Send to background
      chrome.runtime.sendMessage({
        type: 'MESSAGE_CAPTURED',
        data
      });
    }

    updateMessage(element) {
      const messageId = this.getElementId(element);
      const stored = this.messageElements.get(messageId);
      
      if (!stored) {
        // New message
        this.captureMessage(element);
        return;
      }

      const currentContent = this.extractText(element);
      
      if (currentContent !== stored.lastContent) {
        stored.lastContent = currentContent;
        stored.data.visibleContent = currentContent;
        stored.data.lastUpdated = Date.now();

        chrome.runtime.sendMessage({
          type: 'MESSAGE_UPDATED',
          data: stored.data
        });
      }
    }

    getElementId(element) {
      // Try to get a stable ID
      if (element.id) return element.id;
      
      // Generate based on position and content
      const position = this.getMessagePosition(element);
      const contentHash = this.simpleHash(
        this.extractText(element).substring(0, 50)
      );
      
      return `${platform}_${position}_${contentHash}`;
    }

    detectRole(element) {
      if (platform === 'chatgpt') {
        return element.getAttribute('data-message-author-role');
      } else if (platform === 'claude') {
        // Claude detection logic
        const isUser = element.querySelector('[data-is-user-message]');
        return isUser ? 'user' : 'assistant';
      } else if (platform === 'gemini') {
        return element.classList.contains('user-turn') ? 'user' : 'assistant';
      }
      return 'unknown';
    }

    extractText(element) {
      // Clone to avoid modifying original
      const clone = element.cloneNode(true);
      
      // Remove unwanted elements
      clone.querySelectorAll('button, .controls, .metadata').forEach(
        el => el.remove()
      );
      
      return clone.textContent.trim();
    }

    getMessagePosition(element) {
      const allMessages = this.findMessageElements();
      return allMessages.indexOf(element);
    }

    extractAttachments(element) {
      const attachments = [];

      // Images
      element.querySelectorAll('img').forEach(img => {
        attachments.push({
          type: 'image',
          src: img.src,
          alt: img.alt || '',
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      });

      // Files/documents
      element.querySelectorAll('a[download], .file-attachment').forEach(link => {
        attachments.push({
          type: 'file',
          name: link.textContent.trim(),
          url: link.href
        });
      });

      return attachments;
    }

    extractCodeBlocks(element) {
      const codeBlocks = [];

      element.querySelectorAll('pre code, .code-block').forEach((code, index) => {
        codeBlocks.push({
          index,
          language: this.detectLanguage(code),
          content: code.textContent,
          lines: code.textContent.split('\n').length
        });
      });

      return codeBlocks;
    }

    detectLanguage(codeElement) {
      // Try to detect from class names
      const classes = codeElement.className.split(' ');
      for (const cls of classes) {
        if (cls.startsWith('language-')) {
          return cls.replace('language-', '');
        }
      }
      return 'plaintext';
    }

    simpleHash(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(36);
    }
  }

  // ============================================================================
  // Suggestion Overlay
  // ============================================================================

  class SuggestionOverlay {
    constructor() {
      this.overlay = null;
      this.setupMessageListener();
    }

    setupMessageListener() {
      chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'SHOW_SUGGESTION') {
          this.showSuggestion(message.data);
        } else if (message.type === 'HIDE_SUGGESTION') {
          this.hideSuggestion();
        }
      });
    }

    showSuggestion(data) {
      if (this.overlay) {
        this.hideSuggestion();
      }

      this.overlay = document.createElement('div');
      this.overlay.className = 'llm-tracker-suggestion';
      this.overlay.innerHTML = `
        <div class="llm-tracker-suggestion-content">
          <div class="llm-tracker-suggestion-icon">💡</div>
          <div class="llm-tracker-suggestion-text">
            <strong>${data.title}</strong>
            <p>${data.message}</p>
          </div>
          <button class="llm-tracker-suggestion-close">×</button>
        </div>
      `;

      document.body.appendChild(this.overlay);

      // Auto-hide after 10 seconds
      setTimeout(() => this.hideSuggestion(), 10000);

      // Close button
      this.overlay.querySelector('.llm-tracker-suggestion-close')
        .addEventListener('click', () => this.hideSuggestion());
    }

    hideSuggestion() {
      if (this.overlay) {
        this.overlay.remove();
        this.overlay = null;
      }
    }
  }

  // ============================================================================
  // Initialize
  // ============================================================================

  const streamInterceptor = new StreamInterceptor();
  const conversationObserver = new ConversationObserver();
  const suggestionOverlay = new SuggestionOverlay();

  console.log('LLM Tracker content script fully initialized');

})();
