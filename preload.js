// Ponte segura entre a página do jogo e o app desktop
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  quit: () => ipcRenderer.send('quit'),
  getConfig: () => ipcRenderer.sendSync('get-config'),
  setConfig: (c) => ipcRenderer.send('set-config', c),
});
