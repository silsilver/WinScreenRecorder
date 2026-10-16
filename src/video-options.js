'use strict';

(() => {
  const profiles = Object.freeze({
    light: Object.freeze({ size: '720', frameRate: 15, videoBitsPerSecond: 2000000 }),
    balanced: Object.freeze({ size: '1080', frameRate: 30, videoBitsPerSecond: 6000000 }),
    high: Object.freeze({ size: 'original', frameRate: 60, videoBitsPerSecond: 16000000 })
  });
  function normalizeVideoOptions(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('La calidad no es válida.');
    const frameRate = value.frameRate ?? 30;
    const videoBitsPerSecond = value.videoBitsPerSecond ?? 6000000;
    if (![15, 30, 60].includes(frameRate)
      || !Number.isInteger(videoBitsPerSecond) || videoBitsPerSecond < 1000000 || videoBitsPerSecond > 20000000) {
      throw new Error('La calidad no es válida.');
    }
    return { frameRate, videoBitsPerSecond };
  }
  function normalizeDuration(value = null) {
    if (value === null) return null;
    if (!Number.isFinite(value) || value < 0 || value > 30 * 24 * 3600 * 1000) throw new Error('La duración no es válida.');
    return value;
  }
  const api = { profiles, normalizeVideoOptions, normalizeDuration };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.recorderVideoOptions = api;
})();
