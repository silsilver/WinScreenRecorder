'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('libraryAPI', {
  encoderStatus: () => ipcRenderer.invoke('library-encoder-status'),
  cancel: () => ipcRenderer.invoke('library-cancel'),
  list: () => ipcRenderer.invoke('library-list'),
  rename: (id, name) => ipcRenderer.invoke('library-rename', id, name),
  open: (id, folder = false) => ipcRenderer.invoke('library-open', id, folder),
  forget: (id) => ipcRenderer.invoke('library-forget', id),
  importCapture: () => ipcRenderer.invoke('library-import'),
  trim: (id, start, end) => ipcRenderer.invoke('library-trim', id, start, end),
  shortcuts: () => ipcRenderer.invoke('library-shortcuts'),
  saveShortcuts: (settings) => ipcRenderer.invoke('library-save-shortcuts', settings),
  onChanged: (callback) => { ipcRenderer.on('library-changed', () => callback()); },
  onProgress: (callback) => { ipcRenderer.on('save-progress', (_event, progress) => callback(progress)); }
});
