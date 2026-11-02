const { app, BrowserWindow, shell, session } = require('electron');
const path = require('node:path');

const APP_URL = 'https://next-trader-ai.vercel.app/next-ai.html';
const TRUSTED_HOST = 'next-trader-ai.vercel.app';

function isTrusted(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === TRUSTED_HOST;
  } catch {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: '#050b12',
    title: 'NEXT AI',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrusted(url)) return { action: 'allow' };
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!isTrusted(url)) event.preventDefault();
  });

  win.loadURL(APP_URL);
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(['media', 'notifications'].includes(permission));
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
