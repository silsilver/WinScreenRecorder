'use strict';
(() => {
  function formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return 'Tamaño no disponible';
    if (bytes < 1024) return `${bytes} bytes`;
    const unit = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / 1024 ** unit).toLocaleString('es-MX', { maximumFractionDigits: 1 })} ${['bytes', 'KiB', 'MiB', 'GiB'][unit]}`;
  }
  function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return 'Duración no disponible';
    const seconds = Math.floor(ms / 1000);
    return `${seconds >= 3600 ? `${Math.floor(seconds / 3600)}:` : ''}${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function sortRecords(records, order) {
    const byDate = (a, b) => (Date.parse(b.savedAt) || 0) - (Date.parse(a.savedAt) || 0);
    const compare = order === 'oldest' ? (a, b) => byDate(b, a) : order === 'name' ? (a, b) => a.name.localeCompare(b.name, 'es')
      : order === 'size' ? (a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0) : order === 'duration' ? (a, b) => (b.durationMs || 0) - (a.durationMs || 0) : byDate;
    return [...records].sort((a, b) => compare(a, b) || a.id.localeCompare(b.id));
  }
  const api = { formatSize, formatDuration, sortRecords };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.recorderLibraryPresentation = api;
})();
