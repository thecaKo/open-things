// Bridge exposed to the web app (see web/src/update.ts).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('openThingsDesktop', {
  platform: process.platform,
  downloadUpdate: (opts) => ipcRenderer.invoke('updates:download', opts),
  applyUpdate: () => ipcRenderer.invoke('updates:apply'),
});
