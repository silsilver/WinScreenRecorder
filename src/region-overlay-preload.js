const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('regionOverlay', {
  onHighlight(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, bounds) => callback(bounds);
    ipcRenderer.on('region-highlight', listener);
    return () => ipcRenderer.removeListener('region-highlight', listener);
  },
  onSelectionStart(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, bounds) => callback(bounds);
    ipcRenderer.on('region-selection-start', listener);
    return () => ipcRenderer.removeListener('region-selection-start', listener);
  },
  finishSelection(region) {
    ipcRenderer.send('region-selection-complete', region);
  }
});
