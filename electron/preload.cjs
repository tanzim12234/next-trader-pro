const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nextDesktop", Object.freeze({
  platform: process.platform,
  openApp: (name) => ipcRenderer.invoke("next:open-app", name),
  speak: (text) => ipcRenderer.invoke("next:speak", text)
}));
