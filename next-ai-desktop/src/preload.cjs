const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nextAI', Object.freeze({
  status: () => ipcRenderer.invoke('settings:status'),
  testConnection: () => ipcRenderer.invoke('ai:test-connection'),
  webResearch: query => ipcRenderer.invoke('ai:web-research', query),
  planTask: goal => ipcRenderer.invoke('ai:plan-task', goal),
  executeTaskStep: action => ipcRenderer.invoke('task:execute-step', action),
  listTaskHistory: () => ipcRenderer.invoke('task:history-list'),
  saveTaskHistory: entry => ipcRenderer.invoke('task:history-add', entry),
  getSystemStats: () => ipcRenderer.invoke('system:stats'),
  saveKeys: keys => ipcRenderer.invoke('settings:save', keys),
  chat: message => ipcRenderer.invoke('ai:chat', message),
  suggestLearning: exchange => ipcRenderer.invoke('ai:learning-suggestions', exchange),
  runAction: action => ipcRenderer.invoke('action:run', action),
  openTextFile: () => ipcRenderer.invoke('files:open-text'),
  saveTextFile: input => ipcRenderer.invoke('files:save-text', input),
  listMemories: query => ipcRenderer.invoke('brain:list', query || ''),
  remember: input => ipcRenderer.invoke('brain:remember', input),
  forgetMemory: id => ipcRenderer.invoke('brain:forget', id),
  clearMemories: () => ipcRenderer.invoke('brain:clear')
}));
