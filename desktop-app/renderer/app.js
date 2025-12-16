/**
 * Main Dashboard Application
 * Simple vanilla JS dashboard (React can be added later)
 */

class Dashboard {
  constructor() {
    this.currentView = 'overview';
    this.conversations = [];
    this.stats = {};
    this.systemPrompts = [];
  }

  async init() {
    await this.loadData();
    this.render();
    this.setupEventListeners();
    this.startAutoRefresh();
  }

  async loadData() {
    try {
      // Load conversations
      this.conversations = await window.api.getConversations(50);

      // Load stats
      const today = new Date();
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      this.stats = await window.api.getUsageStats(
        weekAgo.getTime(),
        today.getTime()
      );

      // Load system prompts
      this.systemPrompts = await window.api.getSystemPrompts();
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }

  render() {
    const root = document.getElementById('root');

    root.innerHTML = `
      <div class="dashboard">
        <!-- Sidebar -->
        <aside class="sidebar">
          <div class="logo">
            <h1>🔍 LLM Tracker</h1>
          </div>

          <nav class="nav">
            <button class="nav-item ${this.currentView === 'overview' ? 'active' : ''}" data-view="overview">
              <span class="icon">📊</span>
              Overview
            </button>
            <button class="nav-item ${this.currentView === 'conversations' ? 'active' : ''}" data-view="conversations">
              <span class="icon">💬</span>
              Conversations
            </button>
            <button class="nav-item ${this.currentView === 'system-prompts' ? 'active' : ''}" data-view="system-prompts">
              <span class="icon">🔐</span>
              System Prompts
            </button>
            <button class="nav-item ${this.currentView === 'analytics' ? 'active' : ''}" data-view="analytics">
              <span class="icon">📈</span>
              Analytics
            </button>
          </nav>

          <div class="sidebar-footer">
            <div class="db-info">
              <small>Database: ${this.stats.totalConversations || 0} conversations</small>
            </div>
          </div>
        </aside>

        <!-- Main Content -->
        <main class="main-content">
          ${this.renderView()}
        </main>
      </div>
    `;

    this.attachStyles();
  }

  renderView() {
    switch (this.currentView) {
      case 'overview':
        return this.renderOverview();
      case 'conversations':
        return this.renderConversations();
      case 'system-prompts':
        return this.renderSystemPrompts();
      case 'analytics':
        return this.renderAnalytics();
      default:
        return '<div>View not found</div>';
    }
  }

  renderOverview() {
    const totalMessages = this.conversations.reduce((sum, c) => sum + (c.message_count || 0), 0);
    const totalTokens = this.conversations.reduce((sum, c) => sum + (c.total_tokens || 0), 0);
    const platformCount = new Set(this.conversations.map(c => c.platform)).size;

    return `
      <div class="overview">
        <header class="page-header">
          <h2>Overview</h2>
          <p class="subtitle">Your LLM usage at a glance</p>
        </header>

        <!-- Stats Grid -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${this.conversations.length}</div>
            <div class="stat-label">Conversations</div>
            <div class="stat-trend">↑ All time</div>
          </div>

          <div class="stat-card">
            <div class="stat-value">${totalMessages}</div>
            <div class="stat-label">Messages</div>
            <div class="stat-trend">Total sent & received</div>
          </div>

          <div class="stat-card">
            <div class="stat-value">${(totalTokens / 1000).toFixed(1)}K</div>
            <div class="stat-label">Tokens</div>
            <div class="stat-trend">Across all platforms</div>
          </div>

          <div class="stat-card">
            <div class="stat-value">${this.systemPrompts.length}</div>
            <div class="stat-label">System Prompts</div>
            <div class="stat-trend">${platformCount} platforms</div>
          </div>
        </div>

        <!-- Recent Conversations -->
        <div class="card">
          <h3>Recent Conversations</h3>
          <div class="conversation-list">
            ${this.conversations.slice(0, 10).map(conv => `
              <div class="conversation-item">
                <div class="conversation-header">
                  <span class="platform-badge ${conv.platform}">${conv.platform}</span>
                  <span class="timestamp">${this.formatDate(conv.last_activity)}</span>
                </div>
                <div class="conversation-title">${conv.title || 'Untitled Conversation'}</div>
                <div class="conversation-meta">
                  ${conv.message_count} messages • ${conv.total_tokens} tokens
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  renderConversations() {
    return `
      <div class="conversations">
        <header class="page-header">
          <h2>Conversations</h2>
          <input type="search" placeholder="Search conversations..." class="search-input" id="search-input">
        </header>

        <div class="conversation-list">
          ${this.conversations.map(conv => `
            <div class="conversation-card" data-id="${conv.id}">
              <div class="conversation-header">
                <span class="platform-badge ${conv.platform}">${conv.platform}</span>
                <span class="timestamp">${this.formatDate(conv.last_activity)}</span>
              </div>
              <h3>${conv.title || 'Untitled Conversation'}</h3>
              <div class="conversation-stats">
                <span>💬 ${conv.message_count} messages</span>
                <span>🎯 ${conv.total_tokens} tokens</span>
                ${conv.model_used ? `<span>🤖 ${conv.model_used}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  renderSystemPrompts() {
    const grouped = {};
    this.systemPrompts.forEach(prompt => {
      if (!grouped[prompt.platform]) {
        grouped[prompt.platform] = [];
      }
      grouped[prompt.platform].push(prompt);
    });

    return `
      <div class="system-prompts">
        <header class="page-header">
          <h2>System Prompts</h2>
          <p class="subtitle">Hidden instructions discovered from API calls</p>
        </header>

        ${Object.entries(grouped).map(([platform, prompts]) => `
          <div class="card">
            <h3 class="platform-header">
              <span class="platform-badge ${platform}">${platform}</span>
              <span class="count">${prompts.length} prompts</span>
            </h3>

            <div class="prompts-list">
              ${prompts.slice(0, 5).map(prompt => `
                <div class="prompt-card">
                  <div class="prompt-text">${this.escapeHtml(prompt.prompt_text.substring(0, 200))}${prompt.prompt_text.length > 200 ? '...' : ''}</div>
                  <div class="prompt-meta">
                    <span>Used ${prompt.occurrence_count} times</span>
                    <span>First seen ${this.formatDate(prompt.first_seen)}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderAnalytics() {
    return `
      <div class="analytics">
        <header class="page-header">
          <h2>Analytics</h2>
          <p class="subtitle">Detailed usage insights</p>
        </header>

        <div class="card">
          <h3>Coming Soon</h3>
          <p>Advanced analytics, charts, and insights will be available here.</p>
          <ul style="margin-top: 16px; padding-left: 20px;">
            <li>Usage trends over time</li>
            <li>Platform comparison</li>
            <li>Token efficiency analysis</li>
            <li>Cost estimation</li>
            <li>Response time patterns</li>
          </ul>
        </div>
      </div>
    `;
  }

  attachStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .dashboard {
        display: flex;
        height: 100vh;
      }

      .sidebar {
        width: 240px;
        background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
        color: white;
        display: flex;
        flex-direction: column;
      }

      .logo {
        padding: 24px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }

      .logo h1 {
        font-size: 20px;
        font-weight: 600;
      }

      .nav {
        flex: 1;
        padding: 16px 0;
      }

      .nav-item {
        width: 100%;
        padding: 12px 24px;
        border: none;
        background: none;
        color: white;
        text-align: left;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 14px;
        transition: background 0.2s;
      }

      .nav-item:hover {
        background: rgba(255,255,255,0.1);
      }

      .nav-item.active {
        background: rgba(255,255,255,0.2);
        font-weight: 600;
      }

      .sidebar-footer {
        padding: 16px 24px;
        border-top: 1px solid rgba(255,255,255,0.1);
        font-size: 12px;
        opacity: 0.8;
      }

      .main-content {
        flex: 1;
        overflow-y: auto;
        padding: 32px;
      }

      .page-header {
        margin-bottom: 32px;
      }

      .page-header h2 {
        font-size: 32px;
        margin-bottom: 8px;
      }

      .subtitle {
        color: #666;
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
        margin-bottom: 32px;
      }

      .stat-card {
        background: white;
        border-radius: 12px;
        padding: 24px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      }

      .stat-value {
        font-size: 36px;
        font-weight: 700;
        color: #667eea;
        margin-bottom: 8px;
      }

      .stat-label {
        font-size: 14px;
        color: #666;
        margin-bottom: 4px;
      }

      .stat-trend {
        font-size: 12px;
        color: #999;
      }

      .card {
        background: white;
        border-radius: 12px;
        padding: 24px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        margin-bottom: 20px;
      }

      .card h3 {
        margin-bottom: 20px;
      }

      .conversation-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .conversation-item, .conversation-card {
        padding: 16px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        transition: all 0.2s;
      }

      .conversation-card:hover {
        border-color: #667eea;
        box-shadow: 0 4px 12px rgba(102,126,234,0.1);
        cursor: pointer;
      }

      .conversation-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }

      .platform-badge {
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
      }

      .platform-badge.chatgpt {
        background: #10a37f;
        color: white;
      }

      .platform-badge.claude {
        background: #d97757;
        color: white;
      }

      .platform-badge.gemini {
        background: #4285f4;
        color: white;
      }

      .timestamp {
        font-size: 12px;
        color: #999;
      }

      .conversation-title {
        font-weight: 600;
        margin-bottom: 8px;
      }

      .conversation-meta, .conversation-stats {
        font-size: 13px;
        color: #666;
        display: flex;
        gap: 16px;
      }

      .search-input {
        width: 100%;
        max-width: 400px;
        padding: 12px 16px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        font-size: 14px;
      }

      .prompts-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .prompt-card {
        padding: 16px;
        background: #f9fafb;
        border-radius: 8px;
      }

      .prompt-text {
        font-family: 'Monaco', 'Courier New', monospace;
        font-size: 13px;
        line-height: 1.6;
        margin-bottom: 12px;
        color: #333;
      }

      .prompt-meta {
        display: flex;
        gap: 16px;
        font-size: 12px;
        color: #666;
      }

      .platform-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .count {
        font-size: 14px;
        color: #666;
        font-weight: normal;
      }
    `;
    document.head.appendChild(style);
  }

  setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        this.currentView = e.currentTarget.dataset.view;
        this.render();
        this.setupEventListeners();
      });
    });

    // Search
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', async (e) => {
        if (e.target.value.length > 2) {
          this.conversations = await window.api.searchConversations(e.target.value);
        } else {
          await this.loadData();
        }
        this.render();
        this.setupEventListeners();
      });
    }

    // Conversation click
    document.querySelectorAll('.conversation-card').forEach(card => {
      card.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        await this.openConversation(id);
      });
    });
  }

  async openConversation(id) {
    try {
      const data = await window.api.getConversation(id);
      alert(`Conversation "${data.conversation.title || 'Untitled'}" with ${data.messages.length} messages`);
    } catch (err) {
      console.error('Failed to open conversation:', err);
    }
  }

  startAutoRefresh() {
    setInterval(() => {
      this.loadData().then(() => {
        if (this.currentView === 'overview') {
          this.render();
          this.setupEventListeners();
        }
      });
    }, 30000); // Refresh every 30 seconds
  }

  formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize dashboard when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const dashboard = new Dashboard();
    dashboard.init();
  });
} else {
  const dashboard = new Dashboard();
  dashboard.init();
}
