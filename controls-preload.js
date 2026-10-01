'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('controls', {
  ready: () => ipcRenderer.send('controls-ready'),
  onInit: (cb) => ipcRenderer.on('init', (_e, data) => cb(data)),
  onError: (cb) => ipcRenderer.on('error', (_e, msg) => cb(msg)),
  onPrefsUpdated: (cb) => ipcRenderer.on('prefs-updated', (_e, prefs) => cb(prefs)),
  onHistoryUpdated: (cb) => ipcRenderer.on('history-updated', (_e, h) => cb(h)),
  clearHistory: () => ipcRenderer.send('clear-history'),
  chooseFolders: () => ipcRenderer.invoke('choose-folders'),
  chooseMusic: () => ipcRenderer.invoke('choose-music'),
  chooseTextFile: () => ipcRenderer.invoke('choose-text-file'),
  choosePatternFolder: () => ipcRenderer.invoke('choose-pattern-folder'),
  chooseImageFolder: () => ipcRenderer.invoke('choose-image-folder'),
  chooseRecordFolder: () => ipcRenderer.invoke('choose-record-folder'),
  chooseAffirmationFolder: () => ipcRenderer.invoke('choose-affirmation-folder'),
  chooseAudioFile: (title) => ipcRenderer.invoke('choose-audio-file', { title }),
  narrationInfo: (file) => ipcRenderer.invoke('narration-info', { file }),
  updateConfig: (cfg) => ipcRenderer.send('update-config', cfg),
  start: (cfg) => ipcRenderer.send('start-playback', cfg),
});
