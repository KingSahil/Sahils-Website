const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.version,
  
  // Update functionality
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  
  // Add any additional API methods you need here
  log: (message) => {
    console.log('Preload:', message);
  }
});

// Add Electron-specific CSS class to body when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('electron-app');
  console.log('🔌 Preload script loaded - SahilsWeb Electron');
});
