/**
 * Usage Analytics Engine
 * Calculates metrics, patterns, and insights from conversation data
 */

class UsageAnalyzer {
  constructor(database) {
    this.db = database;
  }

  /**
   * Calculate token usage by platform
   */
  getTokenUsageByPlatform(startDate, endDate) {
    const query = `
      SELECT
        platform,
        COUNT(DISTINCT conversation_id) as conversation_count,
        SUM(tokens_total) as total_tokens,
        AVG(tokens_total) as avg_tokens_per_message,
        SUM(tokens_prompt) as prompt_tokens,
        SUM(tokens_completion) as completion_tokens
      FROM messages
      JOIN conversations ON conversations.id = messages.conversation_id
      WHERE messages.timestamp BETWEEN ? AND ?
      GROUP BY platform
      ORDER BY total_tokens DESC
    `;

    return this.db.db.prepare(query).all(startDate || 0, endDate || Date.now());
  }

  /**
   * Calculate estimated costs
   */
  calculateCosts(tokenUsage, pricing = {}) {
    const defaultPricing = {
      chatgpt: { prompt: 0.03 / 1000, completion: 0.06 / 1000 }, // GPT-4 pricing per 1K tokens
      claude: { prompt: 0.015 / 1000, completion: 0.075 / 1000 }, // Claude pricing
      gemini: { prompt: 0.001 / 1000, completion: 0.002 / 1000 }, // Gemini pricing
    };

    const rates = { ...defaultPricing, ...pricing };

    return tokenUsage.map(usage => {
      const platformRates = rates[usage.platform] || { prompt: 0, completion: 0 };
      const promptCost = (usage.prompt_tokens || 0) * platformRates.prompt;
      const completionCost = (usage.completion_tokens || 0) * platformRates.completion;

      return {
        ...usage,
        estimated_cost: promptCost + completionCost,
        prompt_cost: promptCost,
        completion_cost: completionCost,
      };
    });
  }

  /**
   * Get usage trends over time
   */
  getUsageTrends(days = 30) {
    const startDate = Date.now() - days * 24 * 60 * 60 * 1000;

    const query = `
      SELECT
        DATE(timestamp / 1000, 'unixepoch') as date,
        COUNT(*) as message_count,
        SUM(tokens_total) as total_tokens,
        COUNT(DISTINCT conversation_id) as conversation_count
      FROM messages
      WHERE timestamp >= ?
      GROUP BY date
      ORDER BY date ASC
    `;

    return this.db.db.prepare(query).all(startDate);
  }

  /**
   * Get peak usage hours
   */
  getPeakUsageHours() {
    const query = `
      SELECT
        CAST(strftime('%H', timestamp / 1000, 'unixepoch', 'localtime') AS INTEGER) as hour,
        COUNT(*) as message_count,
        AVG(tokens_total) as avg_tokens
      FROM messages
      GROUP BY hour
      ORDER BY hour ASC
    `;

    return this.db.db.prepare(query).all();
  }

  /**
   * Get model usage statistics
   */
  getModelUsage() {
    const query = `
      SELECT
        c.model_used as model,
        COUNT(DISTINCT c.id) as usage_count,
        SUM(m.tokens_total) as total_tokens,
        AVG(m.total_generation_time_ms) as avg_response_time
      FROM conversations c
      JOIN messages m ON m.conversation_id = c.id
      WHERE c.model_used IS NOT NULL
      GROUP BY c.model_used
      ORDER BY usage_count DESC
    `;

    return this.db.db.prepare(query).all();
  }

  /**
   * Analyze conversation depth
   */
  getConversationDepthStats() {
    const query = `
      SELECT
        message_count,
        COUNT(*) as conversation_count,
        AVG(total_tokens) as avg_tokens
      FROM conversations
      WHERE message_count > 0
      GROUP BY message_count
      ORDER BY message_count ASC
    `;

    return this.db.db.prepare(query).all();
  }

  /**
   * Get system prompt impact analysis
   */
  getSystemPromptImpact() {
    const query = `
      SELECT
        sp.platform,
        sp.prompt_text,
        sp.occurrence_count,
        AVG(LENGTH(sp.prompt_text)) as avg_length,
        sp.estimated_tokens
      FROM system_prompts sp
      ORDER BY occurrence_count DESC
      LIMIT 20
    `;

    const prompts = this.db.db.prepare(query).all();

    return prompts.map(prompt => ({
      ...prompt,
      token_overhead_per_use: prompt.estimated_tokens || 0,
      total_token_overhead: (prompt.estimated_tokens || 0) * prompt.occurrence_count,
    }));
  }

  /**
   * Calculate productivity metrics
   */
  getProductivityMetrics(days = 7) {
    const startDate = Date.now() - days * 24 * 60 * 60 * 1000;

    const query = `
      SELECT
        COUNT(DISTINCT conversation_id) as active_conversations,
        COUNT(*) as total_messages,
        SUM(tokens_total) as total_tokens,
        AVG(CASE WHEN role = 'assistant' THEN tokens_total END) as avg_response_length,
        AVG(CASE WHEN role = 'assistant' THEN total_generation_time_ms END) as avg_response_time,
        COUNT(DISTINCT DATE(timestamp / 1000, 'unixepoch')) as active_days
      FROM messages
      WHERE timestamp >= ?
    `;

    const result = this.db.db.prepare(query).get(startDate);

    return {
      ...result,
      messages_per_day: result.total_messages / result.active_days,
      tokens_per_day: result.total_tokens / result.active_days,
      conversations_per_day: result.active_conversations / result.active_days,
    };
  }

  /**
   * Get top conversations by tokens
   */
  getTopConversations(limit = 10) {
    const query = `
      SELECT
        c.*,
        COUNT(m.id) as actual_message_count
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      GROUP BY c.id
      ORDER BY c.total_tokens DESC
      LIMIT ?
    `;

    return this.db.db.prepare(query).all(limit);
  }

  /**
   * Generate comprehensive usage report
   */
  generateUsageReport(days = 30) {
    const startDate = Date.now() - days * 24 * 60 * 60 * 1000;

    const tokenUsage = this.getTokenUsageByPlatform(startDate, Date.now());
    const costs = this.calculateCosts(tokenUsage);
    const trends = this.getUsageTrends(days);
    const peakHours = this.getPeakUsageHours();
    const productivity = this.getProductivityMetrics(days);
    const topConversations = this.getTopConversations(10);
    const modelUsage = this.getModelUsage();
    const systemPromptImpact = this.getSystemPromptImpact();

    return {
      period: {
        days,
        start_date: startDate,
        end_date: Date.now(),
      },
      summary: {
        total_tokens: tokenUsage.reduce((sum, u) => sum + (u.total_tokens || 0), 0),
        total_cost: costs.reduce((sum, c) => sum + (c.estimated_cost || 0), 0),
        total_conversations: tokenUsage.reduce((sum, u) => sum + (u.conversation_count || 0), 0),
      },
      by_platform: costs,
      trends,
      peak_hours: peakHours,
      productivity,
      top_conversations: topConversations,
      model_usage: modelUsage,
      system_prompt_impact: systemPromptImpact,
    };
  }
}

module.exports = UsageAnalyzer;
