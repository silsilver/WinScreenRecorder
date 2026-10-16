const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getEncoderStatus: () => ipcRenderer.invoke('get-encoder-status'),
  cancelOperation: () => ipcRenderer.invoke('cancel-operation'),
  onSystemSuspend: (callback) => { ipcRenderer.on('system-suspend', () => callback()); },
  getSources: () => ipcRenderer.invoke('get-sources'),
  getDeveloperInfo: () => ipcRenderer.invoke('get-developer-info'),
  openAboutWindow: (section) => ipcRenderer.invoke('open-about-window', section),
  getKeyboardShortcuts: () => ipcRenderer.invoke('get-keyboard-shortcuts'),
  getSaveDirectory: () => ipcRenderer.invoke('get-save-directory'),
  openLibrary: () => ipcRenderer.invoke('open-library'),
  onKeyboardShortcutsChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('keyboard-shortcuts-changed', listener);
    return () => ipcRenderer.removeListener('keyboard-shortcuts-changed', listener);
  },
  getDiskSpace: () => ipcRenderer.invoke('get-disk-space'),
  chooseSaveDirectory: () => ipcRenderer.invoke('choose-save-directory'),
  resetSaveDirectory: () => ipcRenderer.invoke('reset-save-directory'),
  getStartWithWindows: () => ipcRenderer.invoke('get-start-with-windows'),
  setStartWithWindows: (enabled) => ipcRenderer.invoke('set-start-with-windows', enabled),
  setCompactMode: (compact) => ipcRenderer.invoke('set-compact-mode', compact),
  setCompactSettingsOpen: (expanded, requestedHeight) => ipcRenderer.invoke('set-compact-settings-open', expanded, requestedHeight),
  windowAction: (action) => ipcRenderer.invoke('window-action', action),
  updateTrayCaptureState: (phase, paused, reason) => ipcRenderer.invoke('update-tray-capture-state', phase, paused, reason),
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
  beginRecording: (hasAudio, options) => ipcRenderer.invoke('begin-recording', hasAudio, options),
  appendRecordingChunk: (id, chunk) => ipcRenderer.invoke('append-recording-chunk', id, chunk),
  completeRecording: (id, hasAudio, durationMs) => ipcRenderer.invoke('complete-recording', id, hasAudio, durationMs),
  saveRecording: (id, format) => ipcRenderer.invoke('save-recording', id, format),
  saveImage: (bytes, format, sourceName) => ipcRenderer.invoke('save-image', bytes, format, sourceName),
  onSaveProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('save-progress', listener);
    return () => ipcRenderer.removeListener('save-progress', listener);
  },
  discardRecording: (id) => ipcRenderer.invoke('discard-recording', id),
  onDiskSpaceChanged: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, disk) => callback(disk);
    ipcRenderer.on('disk-space-changed', listener);
    return () => ipcRenderer.removeListener('disk-space-changed', listener);
  },
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
