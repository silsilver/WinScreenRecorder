'use strict';

(() => {
  function normalizeMicrophoneGain(value) {
    const gain = Number(value);
    if (!Number.isFinite(gain) || gain < 0 || gain > 2) throw new Error('El volumen del micrófono no es válido.');
    return gain;
  }
  function createAudioMix({ context, systemTracks = [], microphoneStream = null, gain = 1 }) {
    const destination = context.createMediaStreamDestination();
    const nodes = [];
    let microphoneGain = null;
    let analyser = null;
    if (systemTracks.length) {
      const source = context.createMediaStreamSource(new MediaStream(systemTracks));
      source.connect(destination);
      nodes.push(source);
    }
    if (microphoneStream) {
      const source = context.createMediaStreamSource(microphoneStream);
      microphoneGain = context.createGain();
      microphoneGain.gain.value = normalizeMicrophoneGain(gain);
      analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(microphoneGain);
      microphoneGain.connect(destination);
      microphoneGain.connect(analyser);
      nodes.push(source, microphoneGain, analyser);
    }
    const samples = analyser ? new Float32Array(analyser.fftSize) : null;
    return {
      stream: destination.stream,
      setGain(value) { if (microphoneGain) microphoneGain.gain.value = normalizeMicrophoneGain(value); },
      getLevel() {
        if (!analyser) return 0;
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        return Math.min(100, Math.sqrt(sum / samples.length) * 100);
      },
      dispose() {
        for (const node of nodes) node.disconnect();
        destination.stream.getTracks().forEach((track) => track.stop());
      }
    };
  }
  const api = { createAudioMix, normalizeMicrophoneGain };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.recorderAudio = api;
})();
