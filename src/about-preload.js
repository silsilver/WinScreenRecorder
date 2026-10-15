'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aboutAPI', {
  getInfo: () => ipcRenderer.invoke('get-app-info'),
  onShowSection: (callback) => {
    const listener = (_event, section) => callback(section);
    ipcRenderer.on('show-about-section', listener);
    return () => ipcRenderer.removeListener('show-about-section', listener);
  }
});
