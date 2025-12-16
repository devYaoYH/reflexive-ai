-- database-schema.sql
-- Comprehensive schema for storing full LLM conversation trajectories

-- ============================================================================
-- Conversations Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL, -- 'chatgpt', 'claude', 'gemini'
  platform_conversation_id TEXT, -- ID from the platform
  title TEXT,
  started_at INTEGER NOT NULL, -- Unix timestamp in milliseconds
  last_activity INTEGER NOT NULL,
  message_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  total_cost REAL DEFAULT 0.0,
  model_used TEXT,
  status TEXT DEFAULT 'active', -- 'active', 'archived', 'deleted'
  metadata TEXT, -- JSON blob for additional data
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX idx_conversations_platform ON conversations(platform);
CREATE INDEX idx_conversations_started_at ON conversations(started_at);
CREATE INDEX idx_conversations_last_activity ON conversations(last_activity);
CREATE INDEX idx_conversations_platform_id ON conversations(platform_conversation_id);

-- ============================================================================
-- Messages Table - Stores all message interactions
-- ============================================================================

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  message_id TEXT, -- Platform-specific message ID
  timestamp INTEGER NOT NULL,
  role TEXT NOT NULL, -- 'system', 'user', 'assistant', 'tool'
  
  -- Content
  visible_content TEXT NOT NULL, -- What user sees in UI
  html_content TEXT, -- Raw HTML if available
  
  -- Message metadata
  visible_to_user INTEGER DEFAULT 1, -- Boolean: 0 or 1
  message_position INTEGER,
  is_edited INTEGER DEFAULT 0,
  is_regenerated INTEGER DEFAULT 0,
  parent_message_id TEXT, -- For branching conversations
  
  -- Tokens and timing
  tokens_prompt INTEGER,
  tokens_completion INTEGER,
  tokens_total INTEGER,
  time_to_first_token_ms INTEGER,
  total_generation_time_ms INTEGER,
  
  -- Input method
  input_method TEXT, -- 'keyboard', 'voice', 'paste', 'edit'
  
  -- Files and attachments
  attachments TEXT, -- JSON array
  code_blocks TEXT, -- JSON array
  
  -- Metadata
  metadata TEXT, -- JSON blob
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_messages_role ON messages(role);
CREATE INDEX idx_messages_visible ON messages(visible_to_user);

-- ============================================================================
-- API Captures Table - Raw API request/response data
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_captures (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  request_id TEXT, -- From interception
  timestamp INTEGER NOT NULL,
  
  -- Request details
  request_url TEXT NOT NULL,
  request_method TEXT,
  request_headers TEXT, -- JSON
  request_body TEXT, -- JSON
  
  -- Response details
  response_status INTEGER,
  response_headers TEXT, -- JSON
  response_body TEXT, -- JSON
  raw_response TEXT, -- Complete raw response
  
  -- Extracted parameters
  model TEXT,
  temperature REAL,
  max_tokens INTEGER,
  top_p REAL,
  frequency_penalty REAL,
  presence_penalty REAL,
  
  -- Streaming info
  is_streaming INTEGER DEFAULT 0,
  stream_complete INTEGER DEFAULT 0,
  
  -- Metadata
  platform TEXT,
  api_version TEXT,
  request_fingerprint TEXT,
  
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX idx_api_captures_message ON api_captures(message_id);
CREATE INDEX idx_api_captures_timestamp ON api_captures(timestamp);
CREATE INDEX idx_api_captures_model ON api_captures(model);
CREATE INDEX idx_api_captures_platform ON api_captures(platform);

-- ============================================================================
-- System Prompts Table - Hidden prompts from API calls
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_prompts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  prompt_hash TEXT UNIQUE NOT NULL, -- SHA-256 hash for deduplication
  
  -- Occurrence tracking
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  occurrence_count INTEGER DEFAULT 1,
  
  -- Context
  conversation_ids TEXT, -- JSON array of conversation IDs where this appeared
  typical_position TEXT, -- 'start', 'middle', 'end' of message array
  
  -- Classification
  prompt_type TEXT, -- 'base', 'persona', 'safety', 'feature', 'custom'
  prompt_category TEXT, -- 'instruction', 'constraint', 'format', 'example'
  estimated_tokens INTEGER,
  
  -- Analysis
  contains_pii INTEGER DEFAULT 0, -- Boolean
  is_custom INTEGER DEFAULT 0, -- Boolean
  
  metadata TEXT, -- JSON
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX idx_system_prompts_platform ON system_prompts(platform);
CREATE INDEX idx_system_prompts_hash ON system_prompts(prompt_hash);
CREATE INDEX idx_system_prompts_occurrence ON system_prompts(occurrence_count);
CREATE INDEX idx_system_prompts_last_seen ON system_prompts(last_seen);

-- ============================================================================
-- Streaming Chunks Table - Individual chunks from streaming responses
-- ============================================================================

CREATE TABLE IF NOT EXISTS streaming_chunks (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  api_capture_id TEXT,
  
  chunk_index INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  delta_time_ms INTEGER, -- Time since previous chunk
  
  content TEXT,
  content_type TEXT, -- 'text', 'tool_call', 'thinking'
  raw_data TEXT, -- Original chunk data
  
  -- Token estimation
  estimated_tokens INTEGER,
  
  metadata TEXT, -- JSON
  
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (api_capture_id) REFERENCES api_captures(id) ON DELETE CASCADE
);

CREATE INDEX idx_streaming_chunks_message ON streaming_chunks(message_id);
CREATE INDEX idx_streaming_chunks_timestamp ON streaming_chunks(timestamp);
CREATE INDEX idx_streaming_chunks_index ON streaming_chunks(chunk_index);

-- ============================================================================
-- Conversation Context Table - Full message history per conversation
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversation_context (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  
  -- Full context window as sent to API
  context_messages TEXT NOT NULL, -- JSON array of messages
  context_tokens INTEGER,
  context_window_size INTEGER,
  tokens_remaining INTEGER,
  
  -- What was included
  includes_system_prompt INTEGER DEFAULT 0,
  includes_history INTEGER DEFAULT 0,
  history_message_count INTEGER,
  
  metadata TEXT,
  
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_conversation_context_conv ON conversation_context(conversation_id);
CREATE INDEX idx_conversation_context_timestamp ON conversation_context(timestamp);

-- ============================================================================
-- Usage Sessions Table - User session tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_sessions (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_ms INTEGER,
  
  -- Activity
  page_url TEXT,
  tab_id INTEGER,
  conversation_id TEXT,
  
  -- Metrics
  messages_sent INTEGER DEFAULT 0,
  messages_received INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  total_cost REAL DEFAULT 0.0,
  
  -- Behavior
  time_active_ms INTEGER, -- Time tab was active
  time_inactive_ms INTEGER,
  input_method_counts TEXT, -- JSON object
  
  -- Context
  browser_info TEXT, -- JSON
  screen_time TEXT, -- Time of day, duration patterns
  
  metadata TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
);

CREATE INDEX idx_usage_sessions_platform ON usage_sessions(platform);
CREATE INDEX idx_usage_sessions_started ON usage_sessions(started_at);
CREATE INDEX idx_usage_sessions_duration ON usage_sessions(duration_ms);

-- ============================================================================
-- User Analytics Table - Aggregated metrics
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_analytics (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL, -- YYYY-MM-DD
  platform TEXT NOT NULL,
  
  -- Volume metrics
  total_conversations INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  
  -- User messages
  user_messages_count INTEGER DEFAULT 0,
  avg_user_message_length INTEGER,
  
  -- Assistant messages
  assistant_messages_count INTEGER DEFAULT 0,
  avg_assistant_message_length INTEGER,
  avg_response_time_ms INTEGER,
  
  -- Cost
  estimated_cost REAL DEFAULT 0.0,
  
  -- Timing
  total_time_ms INTEGER DEFAULT 0,
  active_time_ms INTEGER DEFAULT 0,
  avg_session_duration_ms INTEGER,
  
  -- Peak hours
  peak_hour INTEGER, -- 0-23
  messages_by_hour TEXT, -- JSON array of 24 integers
  
  -- Patterns
  most_used_model TEXT,
  regeneration_rate REAL, -- Percentage
  edit_rate REAL,
  
  metadata TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  
  UNIQUE(date, platform)
);

CREATE INDEX idx_user_analytics_date ON user_analytics(date);
CREATE INDEX idx_user_analytics_platform ON user_analytics(platform);

-- ============================================================================
-- Settings Table - User preferences and configuration
-- ============================================================================

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  value_type TEXT, -- 'string', 'number', 'boolean', 'json'
  category TEXT, -- 'tracking', 'privacy', 'ui', 'notifications'
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- Default settings
INSERT OR IGNORE INTO settings (key, value, value_type, category) VALUES
  ('tracking_enabled', '1', 'boolean', 'tracking'),
  ('track_chatgpt', '1', 'boolean', 'tracking'),
  ('track_claude', '1', 'boolean', 'tracking'),
  ('track_gemini', '1', 'boolean', 'tracking'),
  ('capture_system_prompts', '1', 'boolean', 'tracking'),
  ('capture_streaming_chunks', '1', 'boolean', 'tracking'),
  ('anonymize_data', '0', 'boolean', 'privacy'),
  ('auto_suggestions', '1', 'boolean', 'notifications'),
  ('notification_frequency', 'smart', 'string', 'notifications'),
  ('dashboard_refresh_rate', '5000', 'number', 'ui'),
  ('retention_days', '365', 'number', 'privacy');

-- ============================================================================
-- Views for Common Queries
-- ============================================================================

-- Full conversation view with all messages
CREATE VIEW IF NOT EXISTS conversation_full_view AS
SELECT 
  c.id as conversation_id,
  c.platform,
  c.title,
  c.started_at,
  c.last_activity,
  c.message_count,
  c.total_tokens,
  c.total_cost,
  m.id as message_id,
  m.timestamp as message_timestamp,
  m.role,
  m.visible_content,
  m.tokens_total as message_tokens,
  m.time_to_first_token_ms,
  m.total_generation_time_ms
FROM conversations c
LEFT JOIN messages m ON c.id = m.conversation_id
ORDER BY c.started_at DESC, m.message_position ASC;

-- Daily usage summary
CREATE VIEW IF NOT EXISTS daily_usage_summary AS
SELECT 
  date(started_at / 1000, 'unixepoch') as date,
  platform,
  COUNT(DISTINCT id) as conversation_count,
  COUNT(*) as total_conversations,
  SUM(message_count) as total_messages,
  SUM(total_tokens) as total_tokens,
  SUM(total_cost) as total_cost,
  AVG(message_count) as avg_messages_per_conversation,
  AVG((last_activity - started_at) / 1000.0) as avg_duration_seconds
FROM conversations
GROUP BY date, platform
ORDER BY date DESC;

-- System prompt frequency
CREATE VIEW IF NOT EXISTS system_prompt_stats AS
SELECT 
  platform,
  prompt_type,
  COUNT(*) as unique_prompts,
  SUM(occurrence_count) as total_occurrences,
  AVG(estimated_tokens) as avg_tokens,
  MAX(last_seen) as most_recent_use
FROM system_prompts
GROUP BY platform, prompt_type
ORDER BY total_occurrences DESC;

-- ============================================================================
-- Triggers for Auto-updates
-- ============================================================================

-- Update conversation message count and tokens
CREATE TRIGGER IF NOT EXISTS update_conversation_stats
AFTER INSERT ON messages
BEGIN
  UPDATE conversations
  SET 
    message_count = message_count + 1,
    total_tokens = total_tokens + COALESCE(NEW.tokens_total, 0),
    last_activity = NEW.timestamp,
    updated_at = (strftime('%s', 'now') * 1000)
  WHERE id = NEW.conversation_id;
END;

-- Update system prompt occurrence count
CREATE TRIGGER IF NOT EXISTS update_system_prompt_occurrence
AFTER INSERT ON system_prompts
BEGIN
  UPDATE system_prompts
  SET occurrence_count = occurrence_count + 1,
      last_seen = NEW.last_seen,
      updated_at = (strftime('%s', 'now') * 1000)
  WHERE prompt_hash = NEW.prompt_hash AND id != NEW.id;
END;

-- ============================================================================
-- Helper Functions (implemented in application code)
-- ============================================================================

-- These would be implemented in the Node.js/Electron app:
-- - calculateEstimatedCost(tokens, model) -> REAL
-- - classifyPromptType(promptText) -> TEXT
-- - extractPromptCategory(promptText) -> TEXT
-- - estimateTokens(text) -> INTEGER
-- - generatePromptHash(promptText) -> TEXT
-- - anonymizeContent(content) -> TEXT
