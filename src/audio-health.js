'use strict';
(() => {
  function createAudioHealth({ now = () => performance.now(), silenceMs = 10000, clippingMs = 700 } = {}) {
    const channels = new Map();
    return {
      reset() { channels.clear(); },
      update(levels, paused = false) {
        if (paused) { channels.clear(); return []; }
        const messages = [];
        for (const [key, label] of [['microphone', 'Micrófono'], ['system', 'Audio de Windows']]) {
          const sample = levels[key];
          if (!sample?.active) { channels.delete(key); continue; }
          const state = channels.get(key) || { silence: null, clipping: null };
          const time = now();
          state.silence = sample.level < 0.5 ? state.silence ?? time : null;
          state.clipping = sample.peak >= 98 ? state.clipping ?? time : null;
          if (state.clipping !== null && time - state.clipping >= clippingMs) messages.push(`${label}: volumen excesivo; reduce el volumen para evitar distorsión.`);
          else if (state.silence !== null && time - state.silence >= silenceMs) messages.push(`${label}: sin señal durante 10 segundos; revisa la entrada y el volumen.`);
          channels.set(key, state);
        }
        return messages;
      }
    };
  }
  const api = { createAudioHealth };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.recorderAudioHealth = api;
})();
