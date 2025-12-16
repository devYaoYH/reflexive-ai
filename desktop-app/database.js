/**
 * Database Module
 * SQLite database operations for LLM Tracker
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class LLMTrackerDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath || this.getDefaultDbPath();
    this.db = null;
  }

  /**
   * Get default database path
   */
  getDefaultDbPath() {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const dataDir = path.join(homeDir, '.llm-tracker');

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    return path.join(dataDir, 'llm-tracker.db');
  }

  /**
   * Initialize database with schema
   */
  init() {
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');

    // Read and execute schema
    const schemaPath = path.join(__dirname, 'database-schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Execute the entire schema at once - SQLite can handle multiple statements
    try {
      this.db.exec(schema);
    } catch (err) {
      // Ignore "table already exists" errors
      if (!err.message.includes('already exists')) {
        throw err;
      }
    }

    return this;
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Insert or update a conversation
   */
  upsertConversation(data) {
    const stmt = this.db.prepare(`
      INSERT INTO conversations (
        id, platform, platform_conversation_id, started_at, last_activity,
        title, message_count, total_tokens, model_used, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        last_activity = excluded.last_activity,
        message_count = excluded.message_count,
        total_tokens = excluded.total_tokens,
        metadata = excluded.metadata
    `);

    return stmt.run(
      data.id,
      data.platform,
      data.platform_conversation_id || data.conversation_id || null,
      data.started_at,
      data.last_activity,
      data.title || null,
      data.message_count || 0,
      data.total_tokens || 0,
      data.model_used || null,
      JSON.stringify(data.metadata || {})
    );
  }

  /**
   * Insert a message
   */
  insertMessage(data) {
    const stmt = this.db.prepare(`
      INSERT INTO messages (
        id, conversation_id, timestamp, role, visible_content,
        visible_to_user, message_position, is_edited, is_regenerated,
        tokens_prompt, tokens_completion, tokens_total,
        time_to_first_token_ms, total_generation_time_ms, attachments
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      data.id,
      data.conversation_id,
      data.timestamp,
      data.role,
      data.content || data.visible_content,
      data.visible_to_user !== false ? 1 : 0,
      data.message_position || null,
      data.edited || data.is_edited ? 1 : 0,
      data.regenerated || data.is_regenerated ? 1 : 0,
      data.tokens_prompt || null,
      data.tokens_completion || null,
      data.tokens_total || null,
      data.time_to_first_token_ms || null,
      data.total_generation_time_ms || null,
      JSON.stringify(data.attachments || [])
    );
  }

  /**
   * Insert API capture data
   */
  insertApiCapture(data) {
    const stmt = this.db.prepare(`
      INSERT INTO api_captures (
        id, message_id, timestamp, request_url, request_method,
        request_headers, request_body, response_status,
        response_headers, response_body, raw_response,
        model, temperature, max_tokens, is_streaming, platform
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      data.id,
      data.message_id,
      data.timestamp,
      data.request_url || null,
      data.request_method || null,
      JSON.stringify(data.request_headers || {}),
      JSON.stringify(data.request_body || {}),
      data.response_status || null,
      JSON.stringify(data.response_headers || {}),
      JSON.stringify(data.response_body || {}),
      data.raw_response || null,
      data.model || null,
      data.temperature || null,
      data.max_tokens || null,
      data.stream || data.is_streaming ? 1 : 0,
      data.platform || null
    );
  }

  /**
   * Insert or update system prompt
   */
  upsertSystemPrompt(data) {
    const hash = crypto
      .createHash('sha256')
      .update(data.prompt_text)
      .digest('hex');

    const stmt = this.db.prepare(`
      INSERT INTO system_prompts (
        id, platform, prompt_text, first_seen, last_seen,
        occurrence_count, prompt_hash, conversation_ids
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(prompt_hash) DO UPDATE SET
        last_seen = excluded.last_seen,
        occurrence_count = occurrence_count + 1
    `);

    const id = data.id || crypto.randomUUID();

    return stmt.run(
      id,
      data.platform,
      data.prompt_text,
      data.first_seen || Date.now(),
      data.last_seen || Date.now(),
      1,
      hash,
      JSON.stringify(data.conversation_ids || [])
    );
  }

  /**
   * Insert streaming chunk
   */
  insertStreamingChunk(data) {
    const stmt = this.db.prepare(`
      INSERT INTO streaming_chunks (
        id, message_id, chunk_index, timestamp, content, delta_time_ms
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      data.id,
      data.message_id,
      data.chunk_index,
      data.timestamp,
      data.content || null,
      data.delta_time_ms || null
    );
  }

  /**
   * Get conversation by ID
   */
  getConversation(id) {
    const stmt = this.db.prepare('SELECT * FROM conversations WHERE id = ?');
    return stmt.get(id);
  }

  /**
   * Get messages for a conversation
   */
  getMessages(conversationId) {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp ASC
    `);
    return stmt.all(conversationId);
  }

  /**
   * Get API capture for a message
   */
  getApiCapture(messageId) {
    const stmt = this.db.prepare('SELECT * FROM api_captures WHERE message_id = ?');
    return stmt.get(messageId);
  }

  /**
   * Get system prompts by platform
   */
  getSystemPrompts(platform = null) {
    if (platform) {
      const stmt = this.db.prepare(`
        SELECT * FROM system_prompts
        WHERE platform = ?
        ORDER BY occurrence_count DESC
      `);
      return stmt.all(platform);
    } else {
      const stmt = this.db.prepare('SELECT * FROM system_prompts ORDER BY occurrence_count DESC');
      return stmt.all();
    }
  }

  /**
   * Get recent conversations
   */
  getRecentConversations(limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM conversations
      ORDER BY last_activity DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  /**
   * Get usage statistics
   */
  getUsageStats(startDate = null, endDate = null) {
    let query = 'SELECT * FROM usage_summary';
    const params = [];

    if (startDate && endDate) {
      query += ' WHERE date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    } else if (startDate) {
      query += ' WHERE date >= ?';
      params.push(startDate);
    }

    query += ' ORDER BY date DESC';

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Search conversations
   */
  searchConversations(searchTerm) {
    const stmt = this.db.prepare(`
      SELECT DISTINCT c.*
      FROM conversations c
      JOIN messages m ON m.conversation_id = c.id
      WHERE m.visible_content LIKE ? OR c.title LIKE ?
      ORDER BY c.last_activity DESC
      LIMIT 100
    `);
    const term = `%${searchTerm}%`;
    return stmt.all(term, term);
  }
}

module.exports = LLMTrackerDatabase;
