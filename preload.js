const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSources: () => ipcRenderer.invoke('get-sources'),
  getDeveloperInfo: () => ipcRenderer.invoke('get-developer-info'),
  getSaveDirectory: () => ipcRenderer.invoke('get-save-directory'),
  chooseSaveDirectory: () => ipcRenderer.invoke('choose-save-directory'),
  resetSaveDirectory: () => ipcRenderer.invoke('reset-save-directory'),
  getStartWithWindows: () => ipcRenderer.invoke('get-start-with-windows'),
  setStartWithWindows: (enabled) => ipcRenderer.invoke('set-start-with-windows', enabled),
  setCompactMode: (compact) => ipcRenderer.invoke('set-compact-mode', compact),
  setCompactSettingsOpen: (expanded, requestedHeight) => ipcRenderer.invoke('set-compact-settings-open', expanded, requestedHeight),
  windowAction: (action) => ipcRenderer.invoke('window-action', action),
  onCompactModeToggle: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('toggle-compact-mode-request', listener);
    return () => ipcRenderer.removeListener('toggle-compact-mode-request', listener);
  },
  configureCapture: (options) => ipcRenderer.invoke('configure-capture', options),
  clearCapture: () => ipcRenderer.invoke('clear-capture'),
  selectCaptureRegion: () => ipcRenderer.invoke('select-capture-region'),
  showSelectedSourceHighlight: (sourceId) => ipcRenderer.invoke('show-selected-source-highlight', sourceId),
  showSelectedRegionHighlight: (region, sourceId) => ipcRenderer.invoke('show-selected-region-highlight', region, sourceId),
  updateRegionHighlight: (region, frame) => ipcRenderer.invoke('update-region-highlight', region, frame),
  hideRegionHighlight: () => ipcRenderer.invoke('hide-region-highlight'),
  getCaptureFailure: () => ipcRenderer.invoke('get-capture-failure'),
  beginRecording: (hasAudio) => ipcRenderer.invoke('begin-recording', hasAudio),
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
  abortRecording: (id) => ipcRenderer.invoke('abort-recording', id),
  getRecoverySessions: () => ipcRenderer.invoke('get-recovery-sessions-main'),
  openRecoveryWindow: () => ipcRenderer.invoke('open-recovery-window'),
  acknowledgeRecordingPreservedForExit: (id) => ipcRenderer.invoke('recording-preserved-for-exit', id),
  onRecoverySessionsChanged: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, count) => callback(count);
    ipcRenderer.on('recovery-sessions-changed', listener);
    return () => ipcRenderer.removeListener('recovery-sessions-changed', listener);
  },
  onPreserveRecordingForExit: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, id) => callback(id);
    ipcRenderer.on('preserve-recording-for-exit', listener);
    return () => ipcRenderer.removeListener('preserve-recording-for-exit', listener);
  }
});
