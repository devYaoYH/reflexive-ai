/**
 * Preload Script
 * Secure bridge between renderer and main process
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // Conversation operations
  getConversations: (limit) => ipcRenderer.invoke('get-conversations', limit),
  getConversation: (id) => ipcRenderer.invoke('get-conversation', id),
  searchConversations: (searchTerm) =>
    ipcRenderer.invoke('search-conversations', searchTerm),

  // System prompts
  getSystemPrompts: (platform) =>
    ipcRenderer.invoke('get-system-prompts', platform),

  // Analytics
  getUsageStats: (startDate, endDate) =>
    ipcRenderer.invoke('get-usage-stats', startDate, endDate),

  // System info
  getDbPath: () => ipcRenderer.invoke('get-db-path'),
});
