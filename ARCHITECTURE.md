# LLM Usage Tracker - System Architecture

## Overview

A comprehensive system for tracking and analyzing user interactions with LLM platforms (ChatGPT, Claude, Gemini, etc.) consisting of:
1. **Chrome Extension** - Captures user interactions and API traffic
2. **Native Desktop App** - Displays analytics dashboard and provides real-time suggestions
3. **Native Messaging Bridge** - Bidirectional communication between extension and desktop app

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Chrome Browser                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Chrome Extension (Manifest V3)                        │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │ │
│  │  │   Content    │  │  Background  │  │   Popup     │ │ │
│  │  │   Scripts    │  │   Service    │  │     UI      │ │ │
│  │  │              │  │   Worker     │  │             │ │ │
│  │  │ - Inject UI  │  │ - API Track  │  │ - Settings  │ │ │
│  │  │ - Detect LLM │  │ - Data Store │  │ - Quick View│ │ │
│  │  │ - Show Tips  │  │ - Native Msg │  │             │ │ │
│  │  └──────┬───────┘  └──────┬───────┘  └─────────────┘ │ │
│  └─────────┼──────────────────┼───────────────────────────┘ │
└────────────┼──────────────────┼─────────────────────────────┘
             │                  │
             │                  │ Native Messaging
             │                  ▼
             │         ┌─────────────────────┐
             │         │  Native Message     │
             │         │  Host (Node.js)     │
             │         │  - Protocol Bridge  │
             │         │  - IPC Handler      │
             │         └──────────┬──────────┘
             │                    │
             │                    │ IPC/WebSocket
             │                    ▼
    ┌────────▼────────────────────────────────┐
    │   Native Desktop App (Electron)         │
    │  ┌────────────────────────────────────┐ │
    │  │  Main Process                      │ │
    │  │  - Data Processing                 │ │
    │  │  - Analytics Engine                │ │
    │  │  - Background Service              │ │
    │  │  - Notification Manager            │ │
    │  └────────────────┬───────────────────┘ │
    │  ┌────────────────▼───────────────────┐ │
    │  │  Renderer Process                  │ │
    │  │  - Dashboard UI (React)            │ │
    │  │  - Charts & Visualizations         │ │
    │  │  - Settings Panel                  │ │
    │  └────────────────────────────────────┘ │
    │  ┌────────────────────────────────────┐ │
    │  │  Local Database (SQLite)           │ │
    │  │  - Usage History                   │ │
    │  │  - Analytics Cache                 │ │
    │  └────────────────────────────────────┘ │
    └─────────────────────────────────────────┘
```

---

## Component Details

### 1. Chrome Extension

#### Content Scripts
- **Purpose**: Injected into LLM platform pages
- **Responsibilities**:
  - Detect which LLM platform user is on
  - Monitor DOM for chat interactions
  - Inject suggestion overlays
  - Track time spent on page
  - Capture user prompts and responses

#### Background Service Worker
- **Purpose**: Central coordination and data management
- **Responsibilities**:
  - Intercept network requests to LLM APIs
  - Parse API responses
  - Store data in Chrome storage
  - Communicate with native app via native messaging
  - Handle cross-origin requests
  - Aggregate statistics

#### Popup UI
- **Purpose**: Quick access interface
- **Responsibilities**:
  - Show today's usage summary
  - Quick settings toggle
  - Connection status to native app
  - Manual sync trigger

### 2. Native Messaging Host

#### Protocol Bridge (Node.js)
- **Purpose**: Bridge between Chrome and Electron app
- **Responsibilities**:
  - Implement Chrome native messaging protocol
  - Translate messages between Chrome and Electron
  - Handle connection lifecycle
  - Error handling and reconnection

### 3. Desktop Application (Electron)

#### Main Process
**Data Processing Engine**
- Real-time data ingestion from extension
- Usage pattern analysis
- Productivity metrics calculation
- Anomaly detection

**Analytics Engine**
- Time-series analysis
- Session clustering
- Prompt pattern recognition
- Cost estimation (for API usage)

**Background Service**
- Monitor for active LLM usage
- Generate contextual suggestions
- Send notifications to extension
- Periodic data sync

**Notification Manager**
- Smart tip generation
- Timing optimization (don't interrupt flow)
- Context-aware suggestions

#### Renderer Process
**Dashboard UI (React)**
- Overview metrics
- Daily/weekly/monthly trends
- Platform comparison
- Session timeline
- Prompt analysis

**Visualizations**
- Usage over time (charts)
- Platform distribution (pie charts)
- Response time analysis
- Cost tracking
- Productivity scores

---

## Data Flow

### Capturing User Interactions

```
User types prompt → Content Script detects
                   ↓
             Sends to Background Worker
                   ↓
         Background Worker intercepts API call
                   ↓
         Extracts: prompt, response, tokens, timing
                   ↓
         Stores in Chrome Storage + Sends to Native App
                   ↓
         Native App processes and stores in SQLite
```

### Sending Suggestions

```
Desktop App detects usage pattern
         ↓
Generates suggestion
         ↓
Sends via Native Messaging to Extension
         ↓
Background Worker receives
         ↓
Forwards to Content Script
         ↓
Content Script displays overlay/notification
```

---

## Tracked Data Points

### Per Interaction (Enhanced with Full Trajectory)
```json
{
  "id": "uuid",
  "timestamp": "ISO8601",
  "platform": "chatgpt|claude|gemini|other",
  "sessionId": "uuid",
  "conversationId": "platform-conversation-id",
  "messagePosition": 3,
  
  "userMessage": {
    "text": "user input as seen in UI",
    "length": 150,
    "type": "question|command|creative|other",
    "files": ["file1.pdf", "image.png"],
    "edited": false,
    "regenerated": false
  },
  
  "assistantResponse": {
    "visibleText": "response shown to user",
    "length": 500,
    "tokens": 650,
    "timeToFirstToken": 1200,
    "totalTime": 3500,
    "streaming": true,
    "streamChunks": 45,
    "toolCalls": [],
    "citations": []
  },
  
  "apiCapture": {
    "requestUrl": "https://api.openai.com/v1/chat/completions",
    "requestMethod": "POST",
    "requestHeaders": {
      "authorization": "[REDACTED]",
      "content-type": "application/json"
    },
    "requestBody": {
      "model": "gpt-4-turbo-preview",
      "messages": [
        {
          "role": "system",
          "content": "Hidden system prompt that user doesn't see"
        },
        {
          "role": "user", 
          "content": "user's actual message"
        }
      ],
      "temperature": 0.7,
      "max_tokens": 2000,
      "stream": true
    },
    "responseHeaders": {
      "content-type": "text/event-stream",
      "x-request-id": "req_abc123"
    },
    "responseBody": {
      "id": "chatcmpl-abc123",
      "object": "chat.completion",
      "created": 1234567890,
      "model": "gpt-4-turbo-preview",
      "choices": [{
        "index": 0,
        "message": {
          "role": "assistant",
          "content": "Full response with any hidden metadata"
        },
        "finish_reason": "stop"
      }],
      "usage": {
        "prompt_tokens": 120,
        "completion_tokens": 450,
        "total_tokens": 570
      },
      "system_fingerprint": "fp_abc123"
    },
    "rawResponse": "Complete raw response for debugging"
  },
  
  "conversationContext": {
    "fullHistory": [
      {
        "role": "system",
        "content": "System prompt from API",
        "visible": false,
        "timestamp": "ISO8601"
      },
      {
        "role": "user",
        "content": "Previous user message",
        "visible": true,
        "timestamp": "ISO8601"
      },
      {
        "role": "assistant",
        "content": "Previous assistant response",
        "visible": true,
        "timestamp": "ISO8601"
      },
      {
        "role": "user",
        "content": "Current user message",
        "visible": true,
        "timestamp": "ISO8601"
      }
    ],
    "hiddenSystemPrompts": [
      "You are a helpful assistant...",
      "Additional instructions: ..."
    ],
    "contextWindowSize": 8192,
    "tokensUsedSoFar": 3456
  },
  
  "metadata": {
    "model": "gpt-4-turbo-preview",
    "url": "chat.openai.com",
    "pageTitle": "New Chat",
    "browser": "Chrome/120.0",
    "estimatedCost": 0.0234
  },
  
  "uiContext": {
    "timeOnPage": 45000,
    "tabActive": true,
    "scrollPosition": 850,
    "inputMethod": "keyboard|voice|paste",
    "editHistory": [],
    "attachments": []
  }
}
```

### Analytics Metrics
- Total interactions per day/week/month
- Average response time
- Token usage and estimated costs
- Most used platforms
- Peak usage hours
- Session length distribution
- Prompt categories
- Copy/paste vs. typing ratio
- **Conversation depth/length tracking**
- **Hidden system prompt analysis**
- **Model version comparison**
- **Context window utilization**
- **Regeneration frequency**
- **Edit patterns**

---

## Full Conversation Trajectory Storage

### Database Schema

#### conversations table
```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  conversation_id TEXT, -- Platform's conversation ID
  started_at TIMESTAMP NOT NULL,
  last_activity TIMESTAMP NOT NULL,
  title TEXT,
  message_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  model_used TEXT,
  metadata JSON
);
```

#### messages table
```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  role TEXT NOT NULL, -- 'system', 'user', 'assistant', 'tool'
  content TEXT NOT NULL,
  visible_to_user BOOLEAN DEFAULT TRUE,
  message_position INTEGER,
  edited BOOLEAN DEFAULT FALSE,
  regenerated BOOLEAN DEFAULT FALSE,
  
  -- Token tracking
  tokens_prompt INTEGER,
  tokens_completion INTEGER,
  tokens_total INTEGER,
  
  -- Timing
  time_to_first_token_ms INTEGER,
  total_generation_time_ms INTEGER,
  
  -- Files and attachments
  attachments JSON,
  
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
```

#### api_captures table
```sql
CREATE TABLE api_captures (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  
  -- Request details
  request_url TEXT,
  request_method TEXT,
  request_headers JSON,
  request_body JSON,
  
  -- Response details
  response_status INTEGER,
  response_headers JSON,
  response_body JSON,
  raw_response TEXT,
  
  -- Extracted data
  model TEXT,
  system_prompts JSON, -- Array of hidden system prompts
  temperature REAL,
  max_tokens INTEGER,
  stream BOOLEAN,
  
  FOREIGN KEY (message_id) REFERENCES messages(id)
);
```

#### system_prompts table
```sql
CREATE TABLE system_prompts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  first_seen TIMESTAMP NOT NULL,
  last_seen TIMESTAMP NOT NULL,
  occurrence_count INTEGER DEFAULT 1,
  prompt_hash TEXT UNIQUE, -- For deduplication
  context TEXT, -- Where/when it appears
  UNIQUE(prompt_hash)
);
```

#### streaming_chunks table
```sql
CREATE TABLE streaming_chunks (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  content TEXT,
  delta_time_ms INTEGER, -- Time since previous chunk
  
  FOREIGN KEY (message_id) REFERENCES messages(id)
);
```

### Data Capture Strategy

#### 1. Full Request/Response Interception
```javascript
// In background service worker
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (isLLMApiEndpoint(details.url)) {
      // Capture request body
      const requestBody = parseRequestBody(details.requestBody);
      
      // Store immediately
      storeApiRequest({
        url: details.url,
        method: details.method,
        headers: details.requestHeaders,
        body: requestBody,
        timestamp: Date.now()
      });
    }
  },
  { urls: LLM_API_ENDPOINTS },
  ["requestBody", "requestHeaders"]
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (isLLMApiEndpoint(details.url)) {
      // For non-streaming responses
      captureFullResponse(details);
    }
  },
  { urls: LLM_API_ENDPOINTS },
  ["responseHeaders"]
);
```

#### 2. Streaming Response Capture
```javascript
// Inject fetch/XHR interceptor
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const [url, options] = args;
  
  if (isLLMApiEndpoint(url)) {
    const response = await originalFetch.apply(this, args);
    
    if (response.body && isStreamingResponse(response)) {
      // Clone the response to read it without consuming
      const clonedResponse = response.clone();
      const reader = clonedResponse.body.getReader();
      const decoder = new TextDecoder();
      
      let chunkIndex = 0;
      let lastChunkTime = Date.now();
      
      // Read streaming chunks
      const captureStream = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const now = Date.now();
          
          // Send chunk data to extension
          window.postMessage({
            type: 'LLM_STREAM_CHUNK',
            data: {
              chunk,
              chunkIndex: chunkIndex++,
              deltaTime: now - lastChunkTime,
              timestamp: now
            }
          }, '*');
          
          lastChunkTime = now;
        }
      };
      
      captureStream().catch(console.error);
    }
    
    return response;
  }
  
  return originalFetch.apply(this, args);
};
```

#### 3. DOM Observation for Visible Content
```javascript
// In content script
class ConversationObserver {
  constructor() {
    this.messageElements = new Map();
    this.setupObserver();
  }
  
  setupObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Detect new messages
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (this.isMessageNode(node)) {
              this.captureMessage(node);
            }
          });
        }
        
        // Detect message updates (streaming, edits)
        if (mutation.type === 'characterData' || 
            mutation.target.textContent !== this.lastContent) {
          this.updateMessage(mutation.target);
        }
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true
    });
  }
  
  captureMessage(node) {
    const messageData = {
      role: this.detectRole(node),
      visibleContent: node.textContent,
      html: node.innerHTML,
      timestamp: Date.now(),
      position: this.getMessagePosition(node),
      attachments: this.extractAttachments(node)
    };
    
    // Send to background worker
    chrome.runtime.sendMessage({
      type: 'MESSAGE_CAPTURED',
      data: messageData
    });
  }
  
  extractAttachments(node) {
    // Look for images, files, code blocks
    const attachments = [];
    
    node.querySelectorAll('img').forEach(img => {
      attachments.push({
        type: 'image',
        src: img.src,
        alt: img.alt
      });
    });
    
    node.querySelectorAll('pre code').forEach(code => {
      attachments.push({
        type: 'code',
        language: this.detectLanguage(code),
        content: code.textContent
      });
    });
    
    return attachments;
  }
}
```

#### 4. System Prompt Extraction
```javascript
// Platform-specific extractors
const systemPromptExtractors = {
  chatgpt: (apiBody) => {
    const systemMessages = apiBody.messages?.filter(
      m => m.role === 'system'
    );
    return systemMessages?.map(m => m.content) || [];
  },
  
  claude: (apiBody) => {
    // Claude uses 'system' parameter
    const systemPrompts = [];
    if (apiBody.system) {
      systemPrompts.push(apiBody.system);
    }
    // Also check for hidden messages
    apiBody.messages?.forEach(m => {
      if (m.role === 'system' || m.type === 'system') {
        systemPrompts.push(m.content);
      }
    });
    return systemPrompts;
  },
  
  gemini: (apiBody) => {
    // Gemini system instructions
    const systemPrompts = [];
    if (apiBody.systemInstruction) {
      systemPrompts.push(apiBody.systemInstruction.parts?.[0]?.text);
    }
    return systemPrompts;
  }
};

function extractAndStoreSystemPrompts(platform, apiBody, conversationId) {
  const extractor = systemPromptExtractors[platform];
  if (!extractor) return;
  
  const prompts = extractor(apiBody);
  
  prompts.forEach(prompt => {
    const hash = hashSystemPrompt(prompt);
    
    // Store or update
    db.upsertSystemPrompt({
      platform,
      promptText: prompt,
      promptHash: hash,
      conversationId,
      timestamp: Date.now()
    });
  });
}
```

### Data Enrichment and Analysis

#### Hidden Prompt Analysis Dashboard
```javascript
// Analytics for system prompts
const systemPromptAnalytics = {
  // Most common system prompts
  getCommonPrompts(platform, limit = 10) {
    return db.query(`
      SELECT 
        prompt_text,
        occurrence_count,
        first_seen,
        last_seen,
        (last_seen - first_seen) as duration
      FROM system_prompts
      WHERE platform = ?
      ORDER BY occurrence_count DESC
      LIMIT ?
    `, [platform, limit]);
  },
  
  // System prompt changes over time
  getPromptEvolution(platform) {
    return db.query(`
      SELECT 
        DATE(first_seen) as date,
        COUNT(DISTINCT prompt_hash) as unique_prompts,
        SUM(occurrence_count) as total_uses
      FROM system_prompts
      WHERE platform = ?
      GROUP BY DATE(first_seen)
      ORDER BY date
    `);
  },
  
  // Detect new system prompts
  getNewPrompts(since = Date.now() - 7 * 24 * 60 * 60 * 1000) {
    return db.query(`
      SELECT *
      FROM system_prompts
      WHERE first_seen > ?
      ORDER BY first_seen DESC
    `, [since]);
  }
};
```

---

## API Tracking Strategy

### ChatGPT (OpenAI)
```javascript
// Intercept fetch/XHR to:
// POST https://chat.openai.com/backend-api/conversation
// POST https://api.openai.com/v1/chat/completions

// Extract from response:
// - message content
// - model used
// - token usage
// - conversation_id
```

### Claude (Anthropic)
```javascript
// Intercept:
// POST https://claude.ai/api/organizations/*/chat_conversations/*/completion

// Extract:
// - prompt and response
// - model version
// - usage statistics
```

### Gemini (Google)
```javascript
// Intercept:
// POST https://gemini.google.com/api/*

// Extract:
// - conversation data
// - model information
```

### Generic Pattern
```javascript
// Use chrome.webRequest or declarativeNetRequest
// with rules for common patterns:
// - URLs containing: /api/, /chat/, /completion
// - Request bodies with: prompt, messages, model
// - Response bodies with: response, choices, content
```

---

## Security & Privacy Considerations

### Data Handling
1. **Local-First**: All data stored locally by default
2. **No Cloud Sync**: Unless explicitly enabled by user
3. **Encryption**: Sensitive data encrypted at rest
4. **Anonymization**: Personal info stripped before any analytics

### Permissions
- Chrome Extension:
  - `webRequest` - Monitor API calls
  - `storage` - Local data storage
  - `nativeMessaging` - Communicate with desktop app
  - Host permissions for LLM platforms
  
- Desktop App:
  - No internet access required
  - File system access for database
  - System notifications

### User Control
- Toggle tracking per platform
- Clear all data option
- Export data functionality
- Opt-in for any sharing features

---

## Installation Flow

### One-Click Installer for macOS

1. **User downloads DMG**
2. **Opens DMG, double-clicks "Install.app"**
3. **Installer performs**:
   - Installs desktop app to `/Applications/`
   - Installs native messaging host
   - Creates manifest in Chrome directories
   - Sets up proper permissions
   - Launches desktop app
   - Opens Chrome extension install page

4. **User clicks "Add to Chrome"**
5. **Extension connects to native app automatically**
6. **Setup complete!**

---

## Technology Stack

### Chrome Extension
- Manifest V3
- Vanilla JavaScript (or TypeScript)
- Chrome Storage API
- Native Messaging API
- Content Script injection

### Native Messaging Host
- Node.js
- `chrome-native-messaging` library
- IPC communication (electron-ipc or WebSocket)

### Desktop Application
- Electron
- React (UI)
- Recharts / Chart.js (visualizations)
- SQLite (better-sqlite3)
- Tailwind CSS (styling)

### Build & Distribution
- Webpack/Vite for bundling
- electron-builder for app packaging
- DMG creation for macOS distribution

---

## Development Phases

### Phase 1: Core Infrastructure (Week 1-2)
- [ ] Chrome extension skeleton (MV3)
- [ ] Native messaging host
- [ ] Electron app skeleton
- [ ] Basic communication pipeline

### Phase 2: Data Capture (Week 2-3)
- [ ] Content script injection
- [ ] API interception for ChatGPT
- [ ] API interception for Claude
- [ ] API interception for Gemini
- [ ] Data serialization and storage

### Phase 3: Desktop Dashboard (Week 3-4)
- [ ] Database schema
- [ ] React dashboard components
- [ ] Chart visualizations
- [ ] Basic analytics

### Phase 4: Smart Suggestions (Week 4-5)
- [ ] Pattern detection algorithms
- [ ] Suggestion generation
- [ ] Push notifications to extension
- [ ] Content script overlay UI

### Phase 5: Polish & Distribution (Week 5-6)
- [ ] Settings and preferences
- [ ] Data export/import
- [ ] One-click installer
- [ ] Documentation
- [ ] Testing

---

## Next Steps

1. Review and approve architecture
2. Set up development environment
3. Create project repository structure
4. Begin Phase 1 implementation

Would you like me to proceed with implementation of any specific component?
