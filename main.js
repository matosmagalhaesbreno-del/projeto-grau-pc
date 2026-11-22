// Ponto de entrada do app desktop (Electron)
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'Grau Livre',
    backgroundColor: '#0d0f14',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  // F11 alterna tela cheia
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
