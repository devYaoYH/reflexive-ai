# LLM Usage Tracker

A comprehensive system for tracking, analyzing, and optimizing your interactions with Large Language Models (ChatGPT, Claude, Gemini).

## 🎯 Features

### Core Tracking
- ✅ **Full Conversation Trajectories** - Every message, every interaction
- ✅ **Hidden System Prompt Capture** - See what instructions the AI is really following
- ✅ **API-Level Interception** - Complete request/response data
- ✅ **Streaming Analytics** - Track response generation in real-time
- ✅ **Multi-Platform Support** - ChatGPT, Claude, Gemini, and more

### Analytics & Insights
- 📊 **Usage Patterns** - Daily/weekly/monthly trends
- 💰 **Cost Tracking** - Estimate your token spending
- ⚡ **Performance Metrics** - Response times, token efficiency
- 🔍 **System Prompt Analysis** - Track changes and patterns
- 🎯 **Productivity Insights** - Get smarter about how you use AI

### Smart Suggestions
- 💡 **Real-time Tips** - Contextual suggestions while you work
- 🚀 **Optimization Recommendations** - Improve your prompting
- 📈 **Trend Alerts** - Know when your usage patterns change

## 🏗️ Architecture

### Components

1. **Chrome Extension** (Manifest V3)
   - Content scripts for DOM observation
   - Background service worker for API interception
   - Native messaging for desktop app communication

2. **Native Messaging Host** (Node.js)
   - Bridge between Chrome and Electron
   - Protocol translation
   - IPC management

3. **Desktop Application** (Electron)
   - SQLite database for local storage
   - React dashboard with analytics
   - Background service for suggestions
   - Real-time data processing

## 📊 What Gets Tracked

### Per Conversation
```json
{
  "visible_messages": [
    { "role": "user", "content": "What you typed" },
    { "role": "assistant", "content": "AI response" }
  ],
  "hidden_system_prompts": [
    "Instructions the AI follows but you don't see"
  ],
  "api_details": {
    "model": "gpt-4-turbo",
    "tokens": { "prompt": 100, "completion": 500 },
    "temperature": 0.7,
    "timing": { "first_token": 1200, "total": 3500 }
  },
  "streaming_chunks": [
    { "index": 0, "content": "First", "delta_ms": 0 },
    { "index": 1, "content": " part", "delta_ms": 150 }
  ]
}
```

### Analytics
- Token usage by platform, model, time
- Estimated costs
- Response time patterns
- Message length distributions
- Peak usage hours
- Conversation depth analysis
- System prompt evolution
- Model version tracking

## 🔐 Privacy & Security

### Local-First
- **All data stored locally** on your machine
- **No cloud sync** unless you explicitly enable it
- **No external servers** - everything runs on your computer

### Data Control
- Toggle tracking per platform
- Clear all data anytime
- Export your data in JSON format
- Automatic data retention policies
- Anonymization options

### What's NOT Tracked
- No API keys or authentication tokens (redacted)
- No browser cookies
- No personal identifiable information (unless in your messages)

## 📁 Project Structure

```
llm-tracker/
├── chrome-extension/       # Chrome Extension
│   ├── manifest.json       # Extension config
│   ├── background.js       # Service worker (API interception)
│   ├── content.js          # Content script (DOM observation)
│   ├── popup.html/js       # Extension popup UI
│   └── icons/              # Extension icons
│
├── native-host/            # Native Messaging Host
│   ├── host.js             # Main host script
│   ├── manifest.json       # Host manifest
│   └── install.sh          # Installation script
│
├── desktop-app/            # Electron Desktop App
│   ├── main.js             # Electron main process
│   ├── preload.js          # Preload script
│   ├── renderer/           # React UI
│   │   ├── App.jsx         # Main app component
│   │   ├── Dashboard.jsx   # Analytics dashboard
│   │   ├── ConversationViewer.jsx
│   │   └── SystemPromptInspector.jsx
│   ├── database/
│   │   ├── schema.sql      # Database schema
│   │   ├── migrations/     # Schema migrations
│   │   └── queries.js      # Database queries
│   └── analytics/
│       ├── processor.js    # Data processing
│       └── suggestions.js  # Suggestion engine
│
├── installer/              # macOS Installer
│   ├── Install.app         # Click-to-install app
│   ├── install.sh          # Installation script
│   └── uninstall.sh        # Removal script
│
└── docs/
    ├── ARCHITECTURE.md     # System architecture
    ├── IMPLEMENTATION_GUIDE.md  # Implementation details
    └── API.md              # API documentation
```

## 🚀 Installation

### Quick Install (macOS)

1. **Download** the installer DMG
2. **Open** the DMG file
3. **Double-click** `Install.app`
4. **Follow** the prompts
5. **Add extension** to Chrome when prompted
6. **Done!** Start tracking

### Manual Installation

#### 1. Install Native Host
```bash
cd llm-tracker/native-host
chmod +x install.sh
./install.sh
```

#### 2. Install Desktop App
```bash
cd llm-tracker/desktop-app
npm install
npm run build
npm run package  # Creates .app bundle
# Move to Applications folder
```

#### 3. Load Chrome Extension
1. Open Chrome
2. Go to `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select `llm-tracker/chrome-extension`

## 🎮 Usage

### First Run

1. **Desktop App** launches automatically after installation
2. **Extension icon** appears in Chrome toolbar (🔍)
3. **Visit any LLM site** (ChatGPT, Claude, Gemini)
4. **Start chatting** - tracking begins automatically

### Dashboard

Access the dashboard from:
- Desktop app window
- System tray icon
- Keyboard shortcut: `Cmd+Shift+L`

### Features Overview

**📊 Analytics Dashboard**
- Real-time usage stats
- Token consumption charts
- Cost estimates
- Platform comparison

**💬 Conversation Viewer**
- Full conversation history
- System prompt highlighting
- API details inspection
- Export conversations

**🔍 System Prompt Inspector**
- All discovered system prompts
- Frequency analysis
- Change detection
- Token impact

**⚙️ Settings**
- Enable/disable platforms
- Privacy controls
- Notification preferences
- Data retention

## 🛠️ Development

### Setup Development Environment

```bash
# Clone repository
git clone <repo-url>
cd llm-tracker

# Install dependencies
cd chrome-extension && npm install && cd ..
cd native-host && npm install && cd ..
cd desktop-app && npm install && cd ..

# Development mode
cd desktop-app
npm run dev  # Starts Electron in dev mode

# Load extension in Chrome developer mode
# Point to chrome-extension/ directory
```

### Building

```bash
# Build desktop app
cd desktop-app
npm run build
npm run package  # macOS .app
npm run package-win  # Windows .exe
npm run package-linux  # Linux AppImage

# Build installer
cd installer
./build-dmg.sh  # Creates distributable DMG
```

### Testing

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e
```

## 📖 Documentation

- [Architecture Overview](ARCHITECTURE.md)
- [Implementation Guide](IMPLEMENTATION_GUIDE.md)
- [API Documentation](API.md)
- [Database Schema](desktop-app/database-schema.sql)

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines first.

### Development Priorities

1. ✅ Core tracking infrastructure
2. ✅ Full trajectory storage
3. 🚧 Analytics dashboard
4. 📋 Smart suggestions
5. 📋 Multi-user support
6. 📋 Cloud sync (optional)

## 📝 Roadmap

### Version 1.0 (Current)
- [x] Chrome extension with API interception
- [x] Native messaging setup
- [x] Desktop app skeleton
- [x] Database schema
- [ ] Basic dashboard UI
- [ ] System prompt tracking
- [ ] Single-click installer

### Version 1.1
- [ ] Advanced analytics
- [ ] Conversation search
- [ ] Data export/import
- [ ] Custom suggestions
- [ ] Notification system

### Version 2.0
- [ ] Firefox support
- [ ] Windows/Linux installers
- [ ] More LLM platforms
- [ ] Team features
- [ ] Optional cloud sync

## ⚠️ Known Issues

- Streaming capture may miss chunks on slow connections
- Some system prompts might be obfuscated by platforms
- Extension needs reload after Chrome updates
- Dashboard refresh rate configurable in settings

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Chrome Extensions API
- Electron Framework
- SQLite Database
- React & Recharts
- All the LLM platforms we track

## 📧 Support

- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Email**: support@llm-tracker.dev

---

Built with ❤️ for AI power users who want to understand and optimize their LLM usage.
