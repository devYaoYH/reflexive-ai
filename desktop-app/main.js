/**
 * Electron Main Process
 * Handles window management, database, and WebSocket server
 */

const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const LLMTrackerDatabase = require('./database');
const WebSocketServer = require('./websocket-server');

let mainWindow = null;
let database = null;
let wsServer = null;

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'LLM Tracker',
  });

  // Load the dashboard (for now, just a simple HTML file)
  const indexPath = path.join(__dirname, 'renderer', 'index.html');
  mainWindow.loadFile(indexPath).catch(() => {
    // If index.html doesn't exist yet, show a loading message
    mainWindow.loadURL(`data:text/html,
      <!DOCTYPE html>
      <html>
        <head>
          <title>LLM Tracker</title>
          <style>
            body {
              margin: 0;
              padding: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container {
              text-align: center;
            }
            h1 {
              font-size: 3em;
              margin-bottom: 0.5em;
            }
            p {
              font-size: 1.2em;
              opacity: 0.9;
            }
            .status {
              margin-top: 2em;
              padding: 1em 2em;
              background: rgba(255, 255, 255, 0.1);
              border-radius: 10px;
              backdrop-filter: blur(10px);
            }
            .status-item {
              margin: 0.5em 0;
            }
            .status-ok {
              color: #4ade80;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🔍 LLM Tracker</h1>
            <p>Analytics Dashboard</p>
            <div class="status">
              <div class="status-item">
                <span class="status-ok">✓</span> Desktop App Running
              </div>
              <div class="status-item">
                <span class="status-ok">✓</span> Database Connected
              </div>
              <div class="status-item">
                <span class="status-ok">✓</span> WebSocket Server (Port 9876)
              </div>
              <div class="status-item" style="margin-top: 1.5em;">
                Dashboard UI coming soon...
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Create application menu
  createMenu();
}

/**
 * Create application menu
 */
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Refresh',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) {
              mainWindow.reload();
            }
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Initialize database
 */
function initDatabase() {
  try {
    database = new LLMTrackerDatabase();
    database.init();
    console.log('Database initialized');
  } catch (err) {
    console.error('Failed to initialize database:', err);
    throw err;
  }
}

/**
 * Initialize WebSocket server
 */
function initWebSocketServer() {
  try {
    wsServer = new WebSocketServer(database);
    wsServer.start();
    console.log('WebSocket server started');
  } catch (err) {
    console.error('Failed to start WebSocket server:', err);
    throw err;
  }
}

/**
 * Setup IPC handlers
 */
function setupIpcHandlers() {
  // Get recent conversations
  ipcMain.handle('get-conversations', async (event, limit) => {
    return database.getRecentConversations(limit || 50);
  });

  // Get conversation details
  ipcMain.handle('get-conversation', async (event, id) => {
    const conversation = database.getConversation(id);
    const messages = database.getMessages(id);
    return { conversation, messages };
  });

  // Get system prompts
  ipcMain.handle('get-system-prompts', async (event, platform) => {
    return database.getSystemPrompts(platform);
  });

  // Get usage stats
  ipcMain.handle('get-usage-stats', async (event, startDate, endDate) => {
    return database.getUsageStats(startDate, endDate);
  });

  // Search conversations
  ipcMain.handle('search-conversations', async (event, searchTerm) => {
    return database.searchConversations(searchTerm);
  });

  // Get database path
  ipcMain.handle('get-db-path', async () => {
    return database.dbPath;
  });
}

// App lifecycle
app.whenReady().then(() => {
  try {
    // Initialize database
    initDatabase();

    // Initialize WebSocket server
    initWebSocketServer();

    // Setup IPC handlers
    setupIpcHandlers();

    // Create window
    createWindow();

    console.log('LLM Tracker Desktop App started');
  } catch (err) {
    console.error('Failed to start app:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  // Cleanup
  if (wsServer) {
    wsServer.stop();
  }
  if (database) {
    database.close();
  }
});

// Handle errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
