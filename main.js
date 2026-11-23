// App desktop (Electron): janela do jogo, GPU dedicada, VSync configurável e FPS livre.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const cfgPath = () => path.join(app.getPath('userData'), 'config.json');
function readConfig() {
  try { return JSON.parse(fs.readFileSync(cfgPath(), 'utf8')); } catch (e) { return { vsync: true, fullscreen: false }; }
}
const config = readConfig();

// Desempenho: GPU de alto desempenho e sem limite de quadros quando o VSync está desligado
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
if (!config.vsync) {
  app.commandLine.appendSwitch('disable-frame-rate-limit');
  app.commandLine.appendSwitch('disable-gpu-vsync');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: 'Grau Livre',
    backgroundColor: '#07080c',
    autoHideMenuBar: true,
    fullscreen: !!config.fullscreen,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      config.fullscreen = win.isFullScreen();
      saveConfig();
      e.preventDefault();
    }
  });
}

function saveConfig() {
  try { fs.mkdirSync(path.dirname(cfgPath()), { recursive: true }); fs.writeFileSync(cfgPath(), JSON.stringify(config)); } catch (e) { /* ignore */ }
}

ipcMain.on('quit', () => app.quit());
ipcMain.on('get-config', (e) => { e.returnValue = config; });
ipcMain.on('set-config', (e, c) => { Object.assign(config, c); saveConfig(); });

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
