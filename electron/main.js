const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Fix white screen issues by disabling GPU acceleration
// These flags resolve compatibility issues with different graphics drivers
// and prevent the common "white screen of death" in Electron apps
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-gpu-rasterization');
app.commandLine.appendSwitch('disable-gpu-sandbox');

// Set up auto-updater with better configuration
autoUpdater.checkForUpdatesAndNotify();

// Configure auto-updater settings
autoUpdater.autoDownload = false; // Don't auto-download, ask user first
autoUpdater.autoInstallOnAppQuit = true; // Install when app quits

// Enable live reload for development
if (process.env.NODE_ENV === 'development') {
  require('electron-reload')(__dirname, {
    electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit'
  });
}

let mainWindow;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false, // Disable web security for Firebase auth
      allowRunningInsecureContent: true, // Allow mixed content for auth
      // Additional compatibility options for white screen fixes
      enableRemoteModule: false,
      sandbox: false,
      experimentalFeatures: false,
      backgroundThrottling: false,
      offscreen: false,
      // Firebase authentication compatibility
      partition: 'persist:main',
      enableBlinkFeatures: 'CSSCustomHighlightAPI',
      disableBlinkFeatures: 'Auxclick'
    },
    icon: path.join(__dirname, '..', 'public', 'icon.svg'),
    titleBarStyle: 'default',
    show: false,
    frame: true
  });

  // Remove the menu bar completely (but we'll add it back with update option)
  // Menu.setApplicationMenu(null);
  
  // Create a simple menu with update option
  const { Menu } = require('electron');
  const template = [
    {
      label: 'SahilsWeb',
      submenu: [
        {
          label: 'Check for Updates...',
          click: () => {
            console.log('🔍 Manual update check requested');
            autoUpdater.checkForUpdatesAndNotify();
          }
        },
        { type: 'separator' },
        {
          label: 'About SahilsWeb',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About SahilsWeb',
              message: 'SahilsWeb Desktop',
              detail: `Version: 1.1.0\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}\nChrome: ${process.versions.chrome}`
            });
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // IPC handlers for update functionality
  const { ipcMain } = require('electron');
  
  ipcMain.handle('check-for-updates', () => {
    console.log('🔍 Update check requested via IPC');
    autoUpdater.checkForUpdatesAndNotify();
    return 'Update check initiated';
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('get-app-info', () => {
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome
    };
  });

  // Load the app
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // Try multiple paths for the built files
    const possiblePaths = [
      path.join(__dirname, '..', 'dist', 'index.html'),  // Development build
      path.join(__dirname, 'dist', 'index.html'),        // Packaged with extraResources
      path.join(process.resourcesPath, 'dist', 'index.html'), // Packaged in resources
      path.join(__dirname, '..', '..', 'dist', 'index.html')  // Alternative path
    ];
    
    let loadPath = possiblePaths[0]; // Default
    for (const testPath of possiblePaths) {
      if (require('fs').existsSync(testPath)) {
        loadPath = testPath;
        console.log('✅ Found app files at:', loadPath);
        break;
      }
    }
    
    console.log('📁 Loading app from:', loadPath);
    mainWindow.loadFile(loadPath);
  }

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Add class to body for Electron-specific styling
    // Add 'hide-header' class if you want to hide the header in Electron
    mainWindow.webContents.executeJavaScript(`
      document.body.classList.add('electron-app');
      // Uncomment the next line if you want to hide the header in the Electron app:
      // document.body.classList.add('hide-header');
      console.log('🖥️ Electron app loaded - SahilsWeb');
    `);
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links and Firebase authentication
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Allow Firebase authentication URLs to open in new windows
    if (url.includes('accounts.google.com') || 
        url.includes('firebase') || 
        url.includes('firebaseapp.com') ||
        url.includes('googleapis.com')) {
      console.log('🔐 Opening Firebase auth window:', url);
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 500,
          height: 600,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false,
            partition: 'persist:auth'
          }
        }
      };
    }
    
    // Open other external links in default browser
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
}

// App event handlers
app.whenReady().then(() => {
  // Configure session for Firebase authentication
  const { session } = require('electron');
  const mainSession = session.fromPartition('persist:main');
  
  // Allow Firebase domains
  mainSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ['*']
      }
    });
  });
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Auto-updater events with user notifications
autoUpdater.on('checking-for-update', () => {
  console.log('🔍 Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  console.log('🆕 Update available:', info.version);
  
  // Show user-friendly update notification
  const { dialog } = require('electron');
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Available',
    message: `A new version (${info.version}) is available!`,
    detail: 'Would you like to download and install the update? The app will restart after installation.',
    buttons: ['Download & Install', 'Later'],
    defaultId: 0,
    cancelId: 1
  }).then((result) => {
    if (result.response === 0) {
      console.log('📥 User chose to download update');
      autoUpdater.downloadUpdate();
      
      // Show download progress notification
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Downloading Update',
        message: 'Downloading update in the background...',
        detail: 'You can continue using the app. We\'ll notify you when it\'s ready to install.',
        buttons: ['OK']
      });
    } else {
      console.log('⏰ User chose to update later');
    }
  });
});

autoUpdater.on('update-not-available', (info) => {
  console.log('✅ App is up to date');
  // Don't show notification for "no updates" - this would be annoying
});

autoUpdater.on('error', (err) => {
  console.error('❌ Error in auto-updater:', err);
  
  // Only show error dialog in development or if user manually checked
  if (process.env.NODE_ENV === 'development') {
    const { dialog } = require('electron');
    dialog.showErrorBox('Update Error', `Failed to check for updates: ${err.message}`);
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  const percent = Math.round(progressObj.percent);
  console.log(`📥 Download progress: ${percent}% (${progressObj.bytesPerSecond} bytes/sec)`);
  
  // Update window title with progress
  if (mainWindow) {
    mainWindow.setTitle(`SahilsWeb - Downloading update... ${percent}%`);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('✅ Update downloaded successfully');
  
  // Reset window title
  if (mainWindow) {
    mainWindow.setTitle('SahilsWeb');
  }
  
  // Show installation prompt
  const { dialog } = require('electron');
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Ready',
    message: 'Update downloaded successfully!',
    detail: 'The update is ready to install. The app will restart to complete the installation.',
    buttons: ['Restart Now', 'Restart Later'],
    defaultId: 0,
    cancelId: 1
  }).then((result) => {
    if (result.response === 0) {
      console.log('🔄 User chose to restart now');
      autoUpdater.quitAndInstall();
    } else {
      console.log('⏰ User chose to restart later - update will install on next app launch');
      // Update will be installed when app is next closed
    }
  });
});
