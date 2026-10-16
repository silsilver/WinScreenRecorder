'use strict';

(() => {
  function createDownloadProgressReporter(totalBytes, onProgress, now = () => Date.now()) {
    let previous = -1;
    let lastUpdate = -Infinity;
    return (receivedBytes) => {
      const percent = Number.isFinite(totalBytes) && totalBytes > 0 ? Math.min(99, Math.floor(receivedBytes / totalBytes * 100)) : null;
      if ((percent === null || percent !== previous) && now() - lastUpdate >= 250) {
        onProgress({ percent, receivedBytes });
        previous = percent; lastUpdate = now();
      }
    };
  }
  function createFfmpegProgressParser(durationMs, onProgress) {
    let buffer = '';
    let previous = null;
    return (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop().slice(-4096);
      for (const line of lines) {
        const match = /^out_time_us=(\d+)$/.exec(line);
        if (!match) continue;
        const processedMs = Number(match[1]) / 1000;
        const percent = durationMs > 0 ? Math.min(99, Math.floor(processedMs / durationMs * 100)) : null;
        const key = percent ?? Math.floor(processedMs / 1000);
        if (key === previous) continue;
        previous = key;
        onProgress({ percent, processedMs });
      }
    };
  }
  function formatSaveProgress(progress, message) {
    if (Number.isFinite(progress.percent)) return `${message} ${Math.round(progress.percent)} %`;
    if (Number.isFinite(progress.receivedBytes)) return `${message} ${(progress.receivedBytes / 1048576).toFixed(1)} MiB recibidos`;
    if (Number.isFinite(progress.processedMs)) return `${message} ${Math.floor(progress.processedMs / 1000)} s procesados`;
    return message;
  }
  const api = { createFfmpegProgressParser, createDownloadProgressReporter, formatSaveProgress };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.recorderSaveProgress = api;
})();
