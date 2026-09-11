const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  sendPrint: (options) => ipcRenderer.invoke('print-document', options),
  sendRawEscPos: (payload) => ipcRenderer.invoke('send-raw-escpos', payload)
});
