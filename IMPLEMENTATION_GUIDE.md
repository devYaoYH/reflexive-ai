# LLM Tracker - Implementation Guide
## Full Conversation Trajectory Tracking

---

## Overview

This guide covers the complete implementation of capturing, storing, and analyzing the full trajectory of LLM conversations, including:

- ✅ All visible user messages and responses
- ✅ Hidden system prompts from API calls
- ✅ Complete API request/response payloads
- ✅ Streaming chunk-by-chunk capture
- ✅ Token usage and timing metrics
- ✅ Context window analysis
- ✅ Message edits and regenerations

---

## Architecture Summary

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (Chrome Extension)                                   │
│  ┌────────────────┐  ┌───────────────┐  ┌────────────────┐  │
│  │ Content Script │  │  Background   │  │ API Intercept  │  │
│  │                │  │  Service      │  │                │  │
│  │ - DOM Observe  │→ │  Worker       │ ←│ - Fetch Hook   │  │
│  │ - UI Capture   │  │               │  │ - XHR Hook     │  │
│  │ - Suggestions  │  │ - Store Data  │  │ - Stream Read  │  │
│  └────────────────┘  │ - Native Msg  │  └────────────────┘  │
│                      └───────┬───────┘                       │
└──────────────────────────────┼───────────────────────────────┘
                               │ Native Messaging Protocol
┌──────────────────────────────▼───────────────────────────────┐
│  Native Messaging Host (Node.js)                             │
│  - Protocol translation                                       │
│  - IPC/WebSocket bridge                                       │
└──────────────────────────────┬───────────────────────────────┘
                               │ IPC
┌──────────────────────────────▼───────────────────────────────┐
│  Desktop App (Electron)                                       │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Main Process                                        │    │
│  │  - Data ingestion                                    │    │
│  │  - SQLite database (full trajectory storage)        │    │
│  │  - Analytics engine                                  │    │
│  │  - Suggestion generator                              │    │
│  └──────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Renderer Process (Dashboard)                        │    │
│  │  - React UI                                          │    │
│  │  - Conversation viewer                               │    │
│  │  - Analytics charts                                  │    │
│  │  - System prompt analysis                            │    │
│  └──────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────┘
```

---

## Data Capture Strategy

### 1. Visible UI Content (DOM Observation)

**What we capture:**
- Every message as it appears in the UI
- User prompts (typed, pasted, edited)
- Assistant responses (streaming and complete)
- Attachments (images, files, code blocks)
- Message metadata (position, timing, edits)

**How:**
```javascript
// Content script observes DOM mutations
const observer = new MutationObserver((mutations) => {
  // Detect new messages
  // Track message updates (streaming)
  // Capture message edits
  // Extract attachments
});
```

**Why this matters:**
- This is what the user actually sees
- Captures the "ground truth" of the conversation
- Includes UI-specific features (code formatting, etc.)

### 2. API Request/Response (Network Interception)

**What we capture:**
- Complete request payload including:
  - Model parameters (temperature, max_tokens, etc.)
  - Full message history sent to API
  - Hidden system prompts
  - Tool/function definitions
  
- Complete response payload including:
  - Generated content
  - Token usage (prompt, completion, total)
  - Model version used
  - Finish reason
  - Timing information

**How:**
```javascript
// Background service worker
chrome.webRequest.onBeforeRequest.addListener((details) => {
  // Capture request body
  const body = parseRequestBody(details.requestBody);
  storeRequest(body);
}, { urls: LLM_API_ENDPOINTS }, ["requestBody"]);

// Content script fetch interception
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  // Clone and read response
  captureResponse(response.clone());
  return response;
};
```

**Why this matters:**
- Reveals hidden system prompts user doesn't see
- Shows actual parameters used
- Provides accurate token counts
- Enables cost calculation

### 3. Streaming Chunks (Real-time Capture)

**What we capture:**
- Individual chunks as they arrive
- Delta timing between chunks
- Progressive content building
- Streaming metadata

**How:**
```javascript
async function captureStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  let chunkIndex = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    storeChunk({
      index: chunkIndex++,
      content: chunk,
      timestamp: Date.now()
    });
  }
}
```

**Why this matters:**
- Analysis of streaming patterns
- Time-to-first-token metrics
- User experience insights
- Debugging streaming issues

---

## Database Design

### Core Tables

#### 1. **conversations** - High-level conversation metadata
```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  title TEXT,
  started_at INTEGER NOT NULL,
  message_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  ...
);
```

#### 2. **messages** - All messages (user + assistant + system)
```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'system', 'user', 'assistant'
  visible_content TEXT NOT NULL, -- What user sees
  visible_to_user INTEGER DEFAULT 1, -- Hidden system messages
  tokens_total INTEGER,
  ...
);
```

#### 3. **api_captures** - Raw API data
```sql
CREATE TABLE api_captures (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  request_url TEXT NOT NULL,
  request_body TEXT, -- Full JSON
  response_body TEXT, -- Full JSON
  model TEXT,
  temperature REAL,
  ...
);
```

#### 4. **system_prompts** - Deduplicated system prompts
```sql
CREATE TABLE system_prompts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  prompt_hash TEXT UNIQUE, -- For deduplication
  occurrence_count INTEGER DEFAULT 1,
  ...
);
```

#### 5. **streaming_chunks** - Individual streaming chunks
```sql
CREATE TABLE streaming_chunks (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  content TEXT,
  delta_time_ms INTEGER,
  ...
);
```

### Data Flow Example

```
User types: "Write a haiku about coding"
    ↓
[Content Script] Captures visible UI message
    ↓
[Background] Intercepts API request:
    {
      "model": "gpt-4",
      "messages": [
        {
          "role": "system",
          "content": "You are a helpful assistant..." ← HIDDEN!
        },
        {
          "role": "user",
          "content": "Write a haiku about coding"
        }
      ],
      "temperature": 0.7,
      "stream": true
    }
    ↓
Store in api_captures table
Extract system prompt → system_prompts table
    ↓
[Content Script] Captures streaming response chunks
    ↓
Store each chunk in streaming_chunks table
    ↓
[Background] Captures complete response
    ↓
Update message with final content and tokens
    ↓
[Native App] Receives all data via native messaging
    ↓
Store in SQLite database
Calculate analytics
Generate suggestions
```

---

## System Prompt Detection & Analysis

### Detection Strategy

Different platforms have different patterns:

#### ChatGPT (OpenAI)
```javascript
// System prompts are in messages array
{
  "messages": [
    {
      "role": "system",
      "content": "You are ChatGPT, a large language model..."
    },
    {
      "role": "user",
      "content": "User's question"
    }
  ]
}
```

#### Claude (Anthropic)
```javascript
// System prompt is separate parameter
{
  "system": "The assistant is Claude, created by Anthropic...",
  "messages": [
    {
      "role": "user",
      "content": "User's question"
    }
  ]
}
```

#### Gemini (Google)
```javascript
// System instruction structure
{
  "systemInstruction": {
    "parts": [{
      "text": "You are a helpful assistant..."
    }]
  },
  "contents": [...]
}
```

### Extraction & Storage

```javascript
function extractSystemPrompts(apiBody, platform) {
  const prompts = [];
  
  switch(platform) {
    case 'chatgpt':
      apiBody.messages
        ?.filter(m => m.role === 'system')
        .forEach(m => prompts.push(m.content));
      break;
      
    case 'claude':
      if (apiBody.system) {
        prompts.push(apiBody.system);
      }
      break;
      
    case 'gemini':
      if (apiBody.systemInstruction) {
        prompts.push(
          apiBody.systemInstruction.parts?.[0]?.text
        );
      }
      break;
  }
  
  return prompts;
}

async function storeSystemPrompt(promptText, platform) {
  const hash = await hashPrompt(promptText);
  
  // Check if we've seen this before
  const existing = await db.getSystemPrompt(hash);
  
  if (existing) {
    // Increment occurrence count
    await db.updateSystemPrompt(hash, {
      occurrence_count: existing.occurrence_count + 1,
      last_seen: Date.now()
    });
  } else {
    // New system prompt
    await db.insertSystemPrompt({
      hash,
      platform,
      prompt_text: promptText,
      first_seen: Date.now(),
      occurrence_count: 1
    });
  }
}
```

### Analysis Features

**1. System Prompt Evolution Tracking**
```javascript
// Detect when platforms change their system prompts
const promptChanges = await db.query(`
  SELECT 
    prompt_hash,
    prompt_text,
    first_seen,
    last_seen,
    occurrence_count
  FROM system_prompts
  WHERE platform = 'chatgpt'
  ORDER BY first_seen DESC
  LIMIT 20
`);

// Detect new prompts (last 7 days)
const newPrompts = promptChanges.filter(
  p => p.first_seen > Date.now() - 7 * 24 * 60 * 60 * 1000
);
```

**2. Prompt Frequency Analysis**
```javascript
// Most common system prompts by platform
const commonPrompts = await db.query(`
  SELECT 
    platform,
    prompt_text,
    occurrence_count,
    (occurrence_count * 100.0 / (
      SELECT SUM(occurrence_count) 
      FROM system_prompts 
      WHERE platform = sp.platform
    )) as percentage
  FROM system_prompts sp
  ORDER BY platform, occurrence_count DESC
`);
```

**3. Token Usage by System Prompts**
```javascript
// Calculate "tax" of system prompts on token usage
const systemPromptTax = await db.query(`
  SELECT 
    sp.platform,
    sp.estimated_tokens,
    COUNT(DISTINCT ac.conversation_id) as conversations_used,
    SUM(ac.tokens_prompt) as total_prompt_tokens
  FROM system_prompts sp
  JOIN api_captures ac ON ac.request_body LIKE '%' || sp.prompt_hash || '%'
  GROUP BY sp.id
`);
```

---

## Analytics & Insights

### Conversation Analysis

**Full Trajectory Reconstruction**
```javascript
async function getFullConversationTrajectory(conversationId) {
  const conversation = await db.getConversation(conversationId);
  const messages = await db.getMessages(conversationId);
  const apiCaptures = await db.getApiCaptures(conversationId);
  const systemPrompts = await db.getSystemPrompts(conversationId);
  
  return {
    conversation,
    timeline: messages.map(msg => ({
      ...msg,
      apiData: apiCaptures.find(api => api.message_id === msg.id),
      streamingChunks: msg.streaming ? 
        await db.getStreamingChunks(msg.id) : null
    })),
    hiddenSystemPrompts: systemPrompts,
    totalVisibleMessages: messages.filter(m => m.visible_to_user).length,
    totalHiddenMessages: messages.filter(m => !m.visible_to_user).length
  };
}
```

**Token Efficiency Analysis**
```javascript
async function analyzeTokenEfficiency(conversationId) {
  const trajectory = await getFullConversationTrajectory(conversationId);
  
  const systemPromptTokens = trajectory.hiddenSystemPrompts.reduce(
    (sum, p) => sum + p.estimated_tokens, 0
  );
  
  const userTokens = trajectory.timeline
    .filter(m => m.role === 'user')
    .reduce((sum, m) => sum + m.tokens_total, 0);
  
  const assistantTokens = trajectory.timeline
    .filter(m => m.role === 'assistant')
    .reduce((sum, m) => sum + m.tokens_total, 0);
  
  return {
    total: systemPromptTokens + userTokens + assistantTokens,
    systemPromptOverhead: systemPromptTokens,
    systemPromptPercentage: (systemPromptTokens / total) * 100,
    userContent: userTokens,
    assistantContent: assistantTokens,
    efficiency: (assistantTokens / (userTokens + systemPromptTokens))
  };
}
```

**Response Time Patterns**
```javascript
async function analyzeResponseTimes(platform = null) {
  const query = `
    SELECT 
      m.id,
      m.role,
      m.time_to_first_token_ms,
      m.total_generation_time_ms,
      m.tokens_total,
      ac.model,
      (m.total_generation_time_ms * 1.0 / m.tokens_total) as ms_per_token
    FROM messages m
    JOIN api_captures ac ON ac.message_id = m.id
    WHERE m.role = 'assistant'
    ${platform ? `AND ac.platform = '${platform}'` : ''}
    ORDER BY m.timestamp DESC
  `;
  
  const results = await db.query(query);
  
  return {
    avgTimeToFirstToken: avg(results.map(r => r.time_to_first_token_ms)),
    avgTotalTime: avg(results.map(r => r.total_generation_time_ms)),
    avgMsPerToken: avg(results.map(r => r.ms_per_token)),
    byModel: groupBy(results, 'model')
  };
}
```

### Dashboard Visualizations

**1. Conversation Timeline View**
```javascript
// Shows full conversation with hidden prompts highlighted
<ConversationTimeline>
  {messages.map(msg => (
    <Message 
      key={msg.id}
      role={msg.role}
      content={msg.visible_content}
      isHidden={!msg.visible_to_user}
      apiData={msg.apiData}
      streamingChunks={msg.streamingChunks}
      highlight={msg.role === 'system'}
    />
  ))}
</ConversationTimeline>
```

**2. System Prompt Inspector**
```javascript
// Interactive view of all system prompts
<SystemPromptInspector>
  <PromptList>
    {systemPrompts.map(prompt => (
      <PromptCard
        text={prompt.prompt_text}
        platform={prompt.platform}
        occurrences={prompt.occurrence_count}
        firstSeen={prompt.first_seen}
        lastSeen={prompt.last_seen}
        onClick={() => showPromptDetails(prompt)}
      />
    ))}
  </PromptList>
</SystemPromptInspector>
```

**3. Token Flow Sankey Diagram**
```javascript
// Visualize token distribution
<SankeyDiagram>
  <Flow from="Total Tokens" to="System Prompts" value={systemTokens} />
  <Flow from="Total Tokens" to="User Messages" value={userTokens} />
  <Flow from="Total Tokens" to="Assistant" value={assistantTokens} />
</SankeyDiagram>
```

**4. Streaming Performance**
```javascript
// Chunk timing visualization
<StreamingChart>
  {streamingChunks.map((chunk, i) => (
    <ChunkBar
      index={i}
      deltaTime={chunk.delta_time_ms}
      content={chunk.content}
    />
  ))}
</StreamingChart>
```

---

## Privacy & Security

### Data Sanitization

```javascript
function sanitizeApiCapture(capture) {
  // Remove sensitive headers
  if (capture.request_headers) {
    capture.request_headers = capture.request_headers.map(h => {
      if (['authorization', 'cookie', 'api-key'].includes(h.name.toLowerCase())) {
        return { ...h, value: '[REDACTED]' };
      }
      return h;
    });
  }
  
  return capture;
}
```

### User Controls

```javascript
// Settings for data capture
const privacySettings = {
  captureSystemPrompts: true,
  captureStreamingChunks: true,
  captureFullApiPayloads: true,
  anonymizeContent: false, // Replace PII with placeholders
  retentionDays: 365, // Auto-delete old data
  platforms: {
    chatgpt: true,
    claude: true,
    gemini: true
  }
};
```

### Data Export

```javascript
async function exportFullConversation(conversationId) {
  const trajectory = await getFullConversationTrajectory(conversationId);
  
  return {
    metadata: trajectory.conversation,
    messages: trajectory.timeline.map(msg => ({
      timestamp: msg.timestamp,
      role: msg.role,
      visible_to_user: msg.visible_to_user,
      content: msg.visible_content,
      tokens: msg.tokens_total,
      api_details: msg.apiData,
      streaming_data: msg.streamingChunks
    })),
    system_prompts: trajectory.hiddenSystemPrompts,
    analytics: await analyzeTokenEfficiency(conversationId)
  };
}
```

---

## Implementation Checklist

### Phase 1: Basic Capture ✓
- [x] Content script DOM observation
- [x] Background API interception
- [x] Basic message storage
- [x] Native messaging setup

### Phase 2: Full Trajectory ✓
- [x] System prompt extraction
- [x] Streaming chunk capture
- [x] Complete API payload storage
- [x] Database schema design

### Phase 3: Analytics 🚧
- [ ] Token efficiency calculator
- [ ] Response time analyzer
- [ ] System prompt tracker
- [ ] Cost estimator

### Phase 4: Dashboard 🚧
- [ ] Conversation timeline viewer
- [ ] System prompt inspector
- [ ] Analytics charts
- [ ] Export functionality

### Phase 5: Suggestions 📋
- [ ] Pattern detection
- [ ] Productivity tips
- [ ] Real-time suggestions
- [ ] Learning recommendations

---

## Next Steps

1. **Test API Interception**
   - Verify all platforms capture correctly
   - Confirm system prompts are extracted
   - Test streaming capture

2. **Database Implementation**
   - Set up SQLite in Electron
   - Implement data models
   - Create query functions

3. **Build Dashboard**
   - Design conversation viewer
   - Create analytics charts
   - Implement system prompt inspector

4. **Deploy & Test**
   - Package extension
   - Create installer
   - User testing

Would you like me to implement any specific component in detail?
