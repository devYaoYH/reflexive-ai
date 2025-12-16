# Native Messaging Host

Bridge between Chrome Extension and Electron Desktop App.

## Architecture

```
Chrome Extension <--> Native Host <--> Desktop App
                   (stdin/stdout)   (WebSocket)
```

## Installation

### 1. Install Dependencies
```bash
cd native-host
npm install
```

### 2. Install the Native Host
```bash
# Get your Chrome extension ID from chrome://extensions
node install.js <your-extension-id>

# Example:
# node install.js abcdefghijklmnopqrstuvwxyz123456
```

### 3. Verify Installation
```bash
# macOS
ls ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/

# Linux
ls ~/.config/google-chrome/NativeMessagingHosts/
```

## How It Works

1. **Chrome Extension** sends messages via `chrome.runtime.sendNativeMessage()`
2. **Native Host** receives messages via stdin (Chrome's native messaging protocol)
3. **Native Host** forwards messages to Desktop App via WebSocket (port 9876)
4. **Desktop App** processes and responds via WebSocket
5. **Native Host** sends responses back to Chrome via stdout

## Message Protocol

### Chrome → Native Host (stdin)
- 4-byte length prefix (little-endian)
- JSON message

### Native Host → Desktop App (WebSocket)
- JSON message over WebSocket

## Configuration

Edit `host.js` to configure:
- `wsUrl`: WebSocket URL for desktop app (default: `ws://localhost:9876`)
- `reconnectInterval`: Time between reconnection attempts (default: 5000ms)
- `maxReconnectAttempts`: Max reconnection attempts (default: 10)

## Logging

Logs are written to: `~/.llm-tracker/native-host.log`

## Testing

```bash
npm test
```

## Uninstall

```bash
node install.js uninstall
```

## Troubleshooting

### Native host not connecting
1. Check desktop app is running
2. Check WebSocket port (9876) is not in use
3. Check logs: `~/.llm-tracker/native-host.log`

### Extension can't connect
1. Verify extension ID matches the one in the manifest
2. Reinstall: `node install.js uninstall && node install.js <extension-id>`
3. Restart Chrome
