const LLMTrackerDatabase = require('../database');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('LLMTrackerDatabase', () => {
  let db;
  const testDbPath = path.join(os.tmpdir(), 'test-llm-tracker.db');

  beforeEach(() => {
    // Remove test database if it exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    db = new LLMTrackerDatabase(testDbPath);
    db.init();
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Initialization', () => {
    test('should create database file', () => {
      expect(fs.existsSync(testDbPath)).toBe(true);
    });

    test('should initialize with schema', () => {
      const tables = db.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all();
      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain('conversations');
      expect(tableNames).toContain('messages');
      expect(tableNames).toContain('api_captures');
      expect(tableNames).toContain('system_prompts');
      expect(tableNames).toContain('streaming_chunks');
    });
  });

  describe('Conversation Operations', () => {
    test('should insert a conversation', () => {
      const data = {
        id: 'conv-123',
        platform: 'chatgpt',
        conversation_id: 'chatgpt-conv-456',
        started_at: Date.now(),
        last_activity: Date.now(),
        title: 'Test Conversation',
        message_count: 5,
        total_tokens: 1000,
        model_used: 'gpt-4',
        metadata: { test: true },
      };

      db.upsertConversation(data);

      const result = db.getConversation('conv-123');
      expect(result).toBeDefined();
      expect(result.platform).toBe('chatgpt');
      expect(result.title).toBe('Test Conversation');
    });

    test('should update existing conversation', () => {
      const data = {
        id: 'conv-123',
        platform: 'chatgpt',
        started_at: Date.now(),
        last_activity: Date.now(),
        message_count: 5,
      };

      db.upsertConversation(data);
      db.upsertConversation({ ...data, message_count: 10 });

      const result = db.getConversation('conv-123');
      expect(result.message_count).toBe(10);
    });

    test('should get recent conversations', () => {
      const now = Date.now();

      for (let i = 0; i < 5; i++) {
        db.upsertConversation({
          id: `conv-${i}`,
          platform: 'chatgpt',
          started_at: now - i * 1000,
          last_activity: now - i * 1000,
        });
      }

      const conversations = db.getRecentConversations(3);
      expect(conversations).toHaveLength(3);
      expect(conversations[0].id).toBe('conv-0');
    });
  });

  describe('Message Operations', () => {
    beforeEach(() => {
      db.upsertConversation({
        id: 'conv-123',
        platform: 'chatgpt',
        started_at: Date.now(),
        last_activity: Date.now(),
      });
    });

    test('should insert a message', () => {
      const data = {
        id: 'msg-123',
        conversation_id: 'conv-123',
        timestamp: Date.now(),
        role: 'user',
        content: 'Hello, world!',
        visible_to_user: true,
        message_position: 0,
        tokens_total: 10,
      };

      db.insertMessage(data);

      const messages = db.getMessages('conv-123');
      expect(messages).toHaveLength(1);
      expect(messages[0].visible_content).toBe('Hello, world!');
      expect(messages[0].role).toBe('user');
    });

    test('should get messages in order', () => {
      const now = Date.now();

      for (let i = 0; i < 3; i++) {
        db.insertMessage({
          id: `msg-${i}`,
          conversation_id: 'conv-123',
          timestamp: now + i * 1000,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
        });
      }

      const messages = db.getMessages('conv-123');
      expect(messages).toHaveLength(3);
      expect(messages[0].visible_content).toBe('Message 0');
      expect(messages[2].visible_content).toBe('Message 2');
    });
  });

  describe('System Prompt Operations', () => {
    test('should insert a system prompt', () => {
      const data = {
        platform: 'chatgpt',
        prompt_text: 'You are a helpful assistant',
        first_seen: Date.now(),
        last_seen: Date.now(),
      };

      db.upsertSystemPrompt(data);

      const prompts = db.getSystemPrompts('chatgpt');
      expect(prompts).toHaveLength(1);
      expect(prompts[0].prompt_text).toBe('You are a helpful assistant');
    });

    test('should deduplicate system prompts', () => {
      const data = {
        platform: 'chatgpt',
        prompt_text: 'You are a helpful assistant',
        first_seen: Date.now(),
        last_seen: Date.now(),
      };

      db.upsertSystemPrompt(data);
      db.upsertSystemPrompt(data);
      db.upsertSystemPrompt(data);

      const prompts = db.getSystemPrompts('chatgpt');
      expect(prompts).toHaveLength(1);
      expect(prompts[0].occurrence_count).toBe(3);
    });

    test('should filter by platform', () => {
      db.upsertSystemPrompt({
        platform: 'chatgpt',
        prompt_text: 'ChatGPT prompt',
      });
      db.upsertSystemPrompt({
        platform: 'claude',
        prompt_text: 'Claude prompt',
      });

      const chatgptPrompts = db.getSystemPrompts('chatgpt');
      const claudePrompts = db.getSystemPrompts('claude');

      expect(chatgptPrompts).toHaveLength(1);
      expect(claudePrompts).toHaveLength(1);
      expect(chatgptPrompts[0].prompt_text).toBe('ChatGPT prompt');
    });
  });

  describe('Search Operations', () => {
    beforeEach(() => {
      db.upsertConversation({
        id: 'conv-1',
        platform: 'chatgpt',
        started_at: Date.now(),
        last_activity: Date.now(),
        title: 'JavaScript Tutorial',
      });

      db.insertMessage({
        id: 'msg-1',
        conversation_id: 'conv-1',
        timestamp: Date.now(),
        role: 'user',
        content: 'Teach me about React hooks',
      });
    });

    test('should search by message content', () => {
      const results = db.searchConversations('React');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('conv-1');
    });

    test('should search by title', () => {
      const results = db.searchConversations('JavaScript');
      expect(results).toHaveLength(1);
    });

    test('should return empty for no matches', () => {
      const results = db.searchConversations('Python');
      expect(results).toHaveLength(0);
    });
  });

  describe('API Capture Operations', () => {
    beforeEach(() => {
      db.upsertConversation({
        id: 'conv-123',
        platform: 'chatgpt',
        started_at: Date.now(),
        last_activity: Date.now(),
      });

      db.insertMessage({
        id: 'msg-123',
        conversation_id: 'conv-123',
        timestamp: Date.now(),
        role: 'assistant',
        content: 'Response',
      });
    });

    test('should insert API capture', () => {
      const data = {
        id: 'api-123',
        message_id: 'msg-123',
        timestamp: Date.now(),
        request_url: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4',
        system_prompts: ['You are helpful'],
        temperature: 0.7,
      };

      db.insertApiCapture(data);

      const capture = db.getApiCapture('msg-123');
      expect(capture).toBeDefined();
      expect(capture.model).toBe('gpt-4');
    });
  });
});
