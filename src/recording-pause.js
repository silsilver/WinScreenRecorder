'use strict';

(() => {
  function createRecordingPauseController({ recorder, now = () => Date.now(), onChange = () => {} }) {
    let manual = false;
    let writing = false;
    let stopped = false;
    let pausedAt = null;
    let pausedDuration = 0;

    function isActive() {
      return !stopped && ['recording', 'paused'].includes(recorder.state);
    }

    function getState() {
      return { manual, writing, reason: manual ? 'manual' : writing ? 'writing' : null };
    }

    function reconcile() {
      if (!isActive()) return;
      if ((manual || writing) && recorder.state === 'recording') {
        recorder.pause();
        pausedAt = now();
      } else if (!manual && !writing && recorder.state === 'paused') {
        recorder.resume();
        if (pausedAt !== null) pausedDuration += now() - pausedAt;
        pausedAt = null;
      }
      onChange(getState());
    }

    return {
      getState,
      getPausedDuration() { return pausedDuration + (pausedAt === null ? 0 : now() - pausedAt); },
      toggleManual() {
        if (!isActive()) return;
        manual = !manual;
        reconcile();
      },
      updatePendingBytes(bytes) {
        if (!isActive()) return;
        const previous = writing;
        if (bytes >= 24 * 1024 * 1024) writing = true;
        else if (bytes <= 8 * 1024 * 1024) writing = false;
        if (writing !== previous) reconcile();
      },
      stop() {
        if (stopped) return;
        if (pausedAt !== null) pausedDuration += now() - pausedAt;
        pausedAt = null;
        stopped = true;
      }
    };
  }

  const api = { createRecordingPauseController };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.recorderPause = api;
})();
