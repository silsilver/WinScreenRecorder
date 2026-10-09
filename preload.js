const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSources: () => ipcRenderer.invoke('get-sources'),
  getDeveloperInfo: () => ipcRenderer.invoke('get-developer-info'),
  getSaveDirectory: () => ipcRenderer.invoke('get-save-directory'),
  chooseSaveDirectory: () => ipcRenderer.invoke('choose-save-directory'),
  resetSaveDirectory: () => ipcRenderer.invoke('reset-save-directory'),
  setCompactMode: (compact) => ipcRenderer.invoke('set-compact-mode', compact),
  setCompactSettingsOpen: (expanded) => ipcRenderer.invoke('set-compact-settings-open', expanded),
  windowAction: (action) => ipcRenderer.invoke('window-action', action),
  onCompactModeToggle: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('toggle-compact-mode-request', listener);
    return () => ipcRenderer.removeListener('toggle-compact-mode-request', listener);
  },
  configureCapture: (options) => ipcRenderer.invoke('configure-capture', options),
  getCaptureFailure: () => ipcRenderer.invoke('get-capture-failure'),
  beginRecording: () => ipcRenderer.invoke('begin-recording'),
  appendRecordingChunk: (id, chunk) => ipcRenderer.invoke('append-recording-chunk', id, chunk),
  completeRecording: (id, hasAudio) => ipcRenderer.invoke('complete-recording', id, hasAudio),
  saveRecording: (id, format) => ipcRenderer.invoke('save-recording', id, format),
  saveImage: (bytes, format, sourceName) => ipcRenderer.invoke('save-image', bytes, format, sourceName),
  onSaveProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('save-progress', listener);
    return () => ipcRenderer.removeListener('save-progress', listener);
  },
  discardRecording: (id) => ipcRenderer.invoke('discard-recording', id),
  abortRecording: (id) => ipcRenderer.invoke('abort-recording', id)
});
