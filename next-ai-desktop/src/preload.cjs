const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nextAI', Object.freeze({
  status: () => ipcRenderer.invoke('settings:status'),
  saveKeys: keys => ipcRenderer.invoke('settings:save', keys),
  chat: message => ipcRenderer.invoke('ai:chat', message),
  runAction: action => ipcRenderer.invoke('action:run', action),
  listMemories: query => ipcRenderer.invoke('brain:list', query || ''),
  remember: input => ipcRenderer.invoke('brain:remember', input),
  forgetMemory: id => ipcRenderer.invoke('brain:forget', id),
  clearMemories: () => ipcRenderer.invoke('brain:clear')
}));
