'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('prober', {
  onProbe: (cb) => ipcRenderer.on('probe', (_e, data) => cb(data)),
  probeResult: (results) => ipcRenderer.send('probe-result', results),
  ready: () => ipcRenderer.send('probe-ready'),
});
