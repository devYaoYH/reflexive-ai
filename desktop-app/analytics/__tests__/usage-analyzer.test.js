const UsageAnalyzer = require('../usage-analyzer');
const LLMTrackerDatabase = require('../../database');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('UsageAnalyzer', () => {
  let db;
  let analyzer;
  const testDbPath = path.join(os.tmpdir(), 'test-analytics.db');

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    db = new LLMTrackerDatabase(testDbPath);
    db.init();
    analyzer = new UsageAnalyzer(db);

    // Seed test data
    seedTestData(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Token Usage Analysis', () => {
    test('should calculate token usage by platform', () => {
      const result = analyzer.getTokenUsageByPlatform();
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('platform');
      expect(result[0]).toHaveProperty('total_tokens');
    });

    test('should group by platform correctly', () => {
      const result = analyzer.getTokenUsageByPlatform();
      const platforms = result.map(r => r.platform);
      expect(platforms).toContain('chatgpt');
      expect(platforms).toContain('claude');
    });
  });

  describe('Cost Calculation', () => {
    test('should calculate costs with default pricing', () => {
      const tokenUsage = [
        {
          platform: 'chatgpt',
          prompt_tokens: 1000,
          completion_tokens: 2000,
        },
      ];

      const costs = analyzer.calculateCosts(tokenUsage);
      expect(costs[0]).toHaveProperty('estimated_cost');
      expect(costs[0].estimated_cost).toBeGreaterThan(0);
    });

    test('should handle custom pricing', () => {
      const tokenUsage = [
        {
          platform: 'chatgpt',
          prompt_tokens: 1000,
          completion_tokens: 1000,
        },
      ];

      const customPricing = {
        chatgpt: { prompt: 0.01 / 1000, completion: 0.02 / 1000 },
      };

      const costs = analyzer.calculateCosts(tokenUsage, customPricing);
      expect(costs[0].estimated_cost).toBeCloseTo(0.03, 4);
    });
  });

  describe('Usage Trends', () => {
    test('should get usage trends', () => {
      const trends = analyzer.getUsageTrends(7);
      expect(Array.isArray(trends)).toBe(true);
      if (trends.length > 0) {
        expect(trends[0]).toHaveProperty('date');
        expect(trends[0]).toHaveProperty('message_count');
      }
    });
  });

  describe('Model Usage', () => {
    test('should get model usage statistics', () => {
      const modelUsage = analyzer.getModelUsage();
      expect(Array.isArray(modelUsage)).toBe(true);
    });
  });

  describe('Productivity Metrics', () => {
    test('should calculate productivity metrics', () => {
      const metrics = analyzer.getProductivityMetrics(7);
      expect(metrics).toHaveProperty('total_messages');
      expect(metrics).toHaveProperty('messages_per_day');
    });

    test('should handle division by zero for inactive days', () => {
      const metrics = analyzer.getProductivityMetrics(365);
      expect(isNaN(metrics.messages_per_day)).toBe(false);
    });
  });

  describe('Usage Report', () => {
    test('should generate comprehensive usage report', () => {
      const report = analyzer.generateUsageReport(30);
      expect(report).toHaveProperty('period');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('by_platform');
      expect(report).toHaveProperty('trends');
      expect(report).toHaveProperty('productivity');
    });

    test('should include cost estimates in report', () => {
      const report = analyzer.generateUsageReport(30);
      expect(report.summary).toHaveProperty('total_cost');
      expect(typeof report.summary.total_cost).toBe('number');
    });
  });
});

/**
 * Seed test data
 */
function seedTestData(db) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Create conversations
  db.upsertConversation({
    id: 'conv-1',
    platform: 'chatgpt',
    started_at: now - 2 * dayMs,
    last_activity: now,
    message_count: 4,
    total_tokens: 1000,
    model_used: 'gpt-4',
  });

  db.upsertConversation({
    id: 'conv-2',
    platform: 'claude',
    started_at: now - 1 * dayMs,
    last_activity: now,
    message_count: 2,
    total_tokens: 500,
    model_used: 'claude-3-opus',
  });

  // Create messages
  db.insertMessage({
    id: 'msg-1',
    conversation_id: 'conv-1',
    timestamp: now - 2 * dayMs,
    role: 'user',
    content: 'Test message',
    tokens_prompt: 50,
    tokens_total: 50,
  });

  db.insertMessage({
    id: 'msg-2',
    conversation_id: 'conv-1',
    timestamp: now - 2 * dayMs + 1000,
    role: 'assistant',
    content: 'Response',
    tokens_completion: 200,
    tokens_total: 200,
    total_generation_time_ms: 1500,
  });

  db.insertMessage({
    id: 'msg-3',
    conversation_id: 'conv-2',
    timestamp: now - 1 * dayMs,
    role: 'user',
    content: 'Another test',
    tokens_prompt: 30,
    tokens_total: 30,
  });

  // Create system prompts
  db.upsertSystemPrompt({
    platform: 'chatgpt',
    prompt_text: 'You are a helpful assistant',
    first_seen: now - 2 * dayMs,
    last_seen: now,
  });
}
