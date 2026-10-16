'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('recoveryAPI', {
  cancel: () => ipcRenderer.invoke('cancel-recovery-operation'),
  list: () => ipcRenderer.invoke('get-recovery-sessions-window'),
  continue: (id, format) => ipcRenderer.invoke('continue-recovery', id, format),
  discard: (id) => ipcRenderer.invoke('discard-recovery', id),
  onSaveProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('save-progress', listener);
    return () => ipcRenderer.removeListener('save-progress', listener);
  },
  onSessionsChanged: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('recovery-sessions-changed', listener);
    return () => ipcRenderer.removeListener('recovery-sessions-changed', listener);
  }
});
