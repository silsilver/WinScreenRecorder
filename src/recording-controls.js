'use strict';
(() => {
  function limitMilliseconds(minutes) {
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) throw new Error('El límite debe ser de 0 a 1440 minutos enteros.');
    return minutes * 60000;
  }
  function watchCaptureTracks(entries, onMuted, onEnded) {
    const muted = new Map();
    const listeners = [];
    for (const { track, label } of entries) {
      const mute = () => { muted.set(track, label); onMuted([...muted.values()]); };
      const unmute = () => { muted.delete(track); onMuted([...muted.values()]); };
      const ended = () => onEnded(label);
      for (const [event, listener] of [['mute', mute], ['unmute', unmute], ['ended', ended]]) {
        track.addEventListener(event, listener); listeners.push([track, event, listener]);
      }
      if (track.muted) mute();
    }
    return { dispose() { for (const [track, event, listener] of listeners) track.removeEventListener(event, listener); listeners.length = 0; muted.clear(); } };
  }
  const api = { limitMilliseconds, watchCaptureTracks };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.recorderControls = api;
})();
