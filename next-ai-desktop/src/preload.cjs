const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nextAI', Object.freeze({
  status: () => ipcRenderer.invoke('settings:status'),
  saveKeys: keys => ipcRenderer.invoke('settings:save', keys),
  chat: message => ipcRenderer.invoke('ai:chat', message),
  runAction: action => ipcRenderer.invoke('action:run', action)
}));
