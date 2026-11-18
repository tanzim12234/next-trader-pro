const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nextDesktop", Object.freeze({
  platform: process.platform,
  openApp: (name) => ipcRenderer.invoke("next:open-app", name),
  speak: (text) => ipcRenderer.invoke("next:speak", text),\n  saveApiKey: (key) => ipcRenderer.invoke("next:save-api-key", key),\n  getApiKey: () => ipcRenderer.invoke("next:get-api-key"),\n  deleteApiKey: () => ipcRenderer.invoke("next:delete-api-key")
}));
