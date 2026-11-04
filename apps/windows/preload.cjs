'use strict';

// Keep the renderer isolated. No Node APIs are exposed to the remote NEXT AI page.
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('nextAI', Object.freeze({
  appName: 'NEXT AI',
  platform: 'windows'
}));
