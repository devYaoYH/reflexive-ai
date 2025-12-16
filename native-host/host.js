#!/usr/bin/env node

/**
 * Native Messaging Host
 * Bridge between Chrome Extension and Electron Desktop App
 *
 * Protocol: Chrome Native Messaging uses stdin/stdout with length-prefixed JSON messages
 * - Reads 4-byte message length (native byte order)
 * - Reads JSON message of that length
 * - Processes and forwards to desktop app via WebSocket
 * - Sends responses back via stdout
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

class NativeMessagingHost {
  constructor(config = {}) {
    this.wsUrl = config.wsUrl || 'ws://localhost:9876';
    this.ws = null;
    this.reconnectInterval = config.reconnectInterval || 5000;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10;
    this.reconnectAttempts = 0;
    this.messageQueue = [];
    this.logFile = config.logFile || path.join(process.env.HOME, '.llm-tracker', 'native-host.log');

    // Ensure log directory exists
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}\n`;

    try {
      fs.appendFileSync(this.logFile, logMessage);
    } catch (err) {
      // Silently fail if logging doesn't work
    }
  }

  /**
   * Connect to the desktop app WebSocket server
   */
  connectToDesktopApp() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
          this.log('Connected to desktop app');
          this.reconnectAttempts = 0;

          // Send queued messages
          while (this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift();
            this.ws.send(JSON.stringify(msg));
          }

          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.sendMessageToChrome(message);
          } catch (err) {
            this.log(`Error parsing message from desktop app: ${err.message}`, 'ERROR');
          }
        });

        this.ws.on('error', (err) => {
          this.log(`WebSocket error: ${err.message}`, 'ERROR');
        });

        this.ws.on('close', () => {
          this.log('Disconnected from desktop app');
          this.ws = null;

          // Attempt to reconnect
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => this.connectToDesktopApp().catch(() => {}), this.reconnectInterval);
          }
        });

      } catch (err) {
        this.log(`Failed to connect to desktop app: ${err.message}`, 'ERROR');
        reject(err);
      }
    });
  }

  /**
   * Send message to Chrome extension via stdout
   * Chrome native messaging protocol: 4-byte length + JSON message
   */
  sendMessageToChrome(message) {
    try {
      const json = JSON.stringify(message);
      const buffer = Buffer.from(json);
      const header = Buffer.alloc(4);
      header.writeUInt32LE(buffer.length, 0);

      process.stdout.write(header);
      process.stdout.write(buffer);

      this.log(`Sent to Chrome: ${json.substring(0, 100)}...`);
    } catch (err) {
      this.log(`Error sending message to Chrome: ${err.message}`, 'ERROR');
    }
  }

  /**
   * Send message to desktop app via WebSocket
   */
  sendMessageToDesktopApp(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
        this.log(`Sent to desktop app: ${JSON.stringify(message).substring(0, 100)}...`);
      } catch (err) {
        this.log(`Error sending to desktop app: ${err.message}`, 'ERROR');
      }
    } else {
      // Queue message for later
      this.messageQueue.push(message);
      this.log('Desktop app not connected, queued message');
    }
  }

  /**
   * Read messages from Chrome extension via stdin
   * Chrome native messaging protocol: 4-byte length + JSON message
   */
  readMessageFromChrome() {
    return new Promise((resolve, reject) => {
      const headerBuffer = Buffer.alloc(4);
      let headerRead = 0;

      const readHeader = () => {
        const chunk = process.stdin.read(4 - headerRead);
        if (chunk) {
          chunk.copy(headerBuffer, headerRead);
          headerRead += chunk.length;

          if (headerRead === 4) {
            const messageLength = headerBuffer.readUInt32LE(0);
            readMessage(messageLength);
          } else {
            process.stdin.once('readable', readHeader);
          }
        } else {
          process.stdin.once('readable', readHeader);
        }
      };

      const readMessage = (length) => {
        const messageBuffer = Buffer.alloc(length);
        let messageRead = 0;

        const readChunk = () => {
          const chunk = process.stdin.read(length - messageRead);
          if (chunk) {
            chunk.copy(messageBuffer, messageRead);
            messageRead += chunk.length;

            if (messageRead === length) {
              try {
                const message = JSON.parse(messageBuffer.toString());
                resolve(message);
              } catch (err) {
                reject(new Error(`Invalid JSON: ${err.message}`));
              }
            } else {
              process.stdin.once('readable', readChunk);
            }
          } else {
            process.stdin.once('readable', readChunk);
          }
        };

        readChunk();
      };

      readHeader();
    });
  }

  /**
   * Main message loop
   */
  async start() {
    this.log('Native messaging host starting...');

    // Connect to desktop app
    try {
      await this.connectToDesktopApp();
    } catch (err) {
      this.log(`Could not connect to desktop app: ${err.message}`, 'WARN');
      // Continue anyway - will queue messages
    }

    // Process messages from Chrome
    while (true) {
      try {
        const message = await this.readMessageFromChrome();
        this.log(`Received from Chrome: ${JSON.stringify(message).substring(0, 100)}...`);

        // Forward to desktop app
        this.sendMessageToDesktopApp(message);

      } catch (err) {
        if (err.message.includes('EOF')) {
          this.log('Chrome extension disconnected');
          break;
        }
        this.log(`Error reading message: ${err.message}`, 'ERROR');
      }
    }

    // Cleanup
    if (this.ws) {
      this.ws.close();
    }
    this.log('Native messaging host stopped');
  }
}

// Export for testing
module.exports = NativeMessagingHost;

// Run if executed directly
if (require.main === module) {
  const host = new NativeMessagingHost();
  host.start().catch((err) => {
    host.log(`Fatal error: ${err.message}`, 'ERROR');
    process.exit(1);
  });

  // Handle termination signals
  process.on('SIGINT', () => {
    host.log('Received SIGINT, shutting down...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    host.log('Received SIGTERM, shutting down...');
    process.exit(0);
  });
}
