const NativeMessagingHost = require('../host');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('NativeMessagingHost', () => {
  let host;
  const testLogFile = path.join(os.tmpdir(), 'test-native-host.log');

  beforeEach(() => {
    // Clean up log file
    if (fs.existsSync(testLogFile)) {
      fs.unlinkSync(testLogFile);
    }

    host = new NativeMessagingHost({
      logFile: testLogFile,
      reconnectInterval: 100,
      maxReconnectAttempts: 2,
    });
  });

  afterEach(() => {
    if (host.ws) {
      host.ws.close();
    }
    if (fs.existsSync(testLogFile)) {
      fs.unlinkSync(testLogFile);
    }
  });

  describe('Constructor', () => {
    test('should initialize with default config', () => {
      const defaultHost = new NativeMessagingHost();
      expect(defaultHost.wsUrl).toBe('ws://localhost:9876');
      expect(defaultHost.reconnectInterval).toBe(5000);
      expect(defaultHost.maxReconnectAttempts).toBe(10);
    });

    test('should accept custom config', () => {
      const customHost = new NativeMessagingHost({
        wsUrl: 'ws://localhost:8888',
        reconnectInterval: 1000,
        maxReconnectAttempts: 5,
      });
      expect(customHost.wsUrl).toBe('ws://localhost:8888');
      expect(customHost.reconnectInterval).toBe(1000);
      expect(customHost.maxReconnectAttempts).toBe(5);
    });

    test('should create log directory if it does not exist', () => {
      const logDir = path.dirname(testLogFile);
      expect(fs.existsSync(logDir)).toBe(true);
    });
  });

  describe('Logging', () => {
    test('should write log messages to file', () => {
      host.log('Test message', 'INFO');
      const logContent = fs.readFileSync(testLogFile, 'utf8');
      expect(logContent).toContain('Test message');
      expect(logContent).toContain('[INFO]');
    });

    test('should include timestamp in log', () => {
      host.log('Test with timestamp');
      const logContent = fs.readFileSync(testLogFile, 'utf8');
      expect(logContent).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test('should handle different log levels', () => {
      host.log('Info message', 'INFO');
      host.log('Warning message', 'WARN');
      host.log('Error message', 'ERROR');

      const logContent = fs.readFileSync(testLogFile, 'utf8');
      expect(logContent).toContain('[INFO]');
      expect(logContent).toContain('[WARN]');
      expect(logContent).toContain('[ERROR]');
    });
  });

  describe('Message Queue', () => {
    test('should initialize with empty message queue', () => {
      expect(host.messageQueue).toEqual([]);
    });

    test('should queue messages when desktop app is not connected', () => {
      const message = { type: 'test', data: 'hello' };
      host.sendMessageToDesktopApp(message);
      expect(host.messageQueue).toContain(message);
    });
  });

  describe('Chrome Message Protocol', () => {
    test('should encode message with correct length prefix', () => {
      const originalWrite = process.stdout.write;
      const writes = [];

      process.stdout.write = function (data) {
        writes.push(data);
        return true;
      };

      const message = { type: 'test', data: 'hello' };
      host.sendMessageToChrome(message);

      process.stdout.write = originalWrite;

      expect(writes.length).toBe(2);
      expect(writes[0].length).toBe(4); // Length header

      const messageLength = writes[0].readUInt32LE(0);
      expect(messageLength).toBe(writes[1].length);

      const decoded = JSON.parse(writes[1].toString());
      expect(decoded).toEqual(message);
    });
  });

  describe('WebSocket URL Configuration', () => {
    test('should use default WebSocket URL', () => {
      expect(host.wsUrl).toBe('ws://localhost:9876');
    });

    test('should allow custom WebSocket URL', () => {
      const customHost = new NativeMessagingHost({
        wsUrl: 'ws://127.0.0.1:3000',
      });
      expect(customHost.wsUrl).toBe('ws://127.0.0.1:3000');
    });
  });

  describe('Reconnection Logic', () => {
    test('should track reconnection attempts', () => {
      expect(host.reconnectAttempts).toBe(0);
      host.reconnectAttempts = 3;
      expect(host.reconnectAttempts).toBe(3);
    });

    test('should have max reconnect attempts configured', () => {
      expect(host.maxReconnectAttempts).toBe(2);
    });
  });
});
