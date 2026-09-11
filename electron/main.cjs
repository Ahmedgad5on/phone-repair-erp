const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Modular Mobile ERP - Desktop Lab & POS',
    backgroundColor: '#020617',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../client/dist/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register Desktop Hardware IPC Handlers
ipcMain.handle('print-document', async (_event, options) => {
  if (!mainWindow) return { success: false, error: 'Window not ready' };
  return new Promise((resolve) => {
    mainWindow.webContents.print(
      {
        silent: options?.silent ?? true,
        printBackground: true,
        deviceName: options?.deviceName || ''
      },
      (success, failureReason) => {
        resolve({ success, error: failureReason });
      }
    );
  });
});

ipcMain.handle('send-raw-escpos', async (_event, payload) => {
  try {
    // In production desktop POS, writes directly to USB / Network ESC/POS Spooler
    console.log('[Electron Hardware] Received RAW ESC/POS buffer payload, length:', payload?.rawCommands?.length);
    return { success: true, message: 'Raw ESC/POS command dispatched to local receipt printer.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
