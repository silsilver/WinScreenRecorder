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
    let systemAnalyser = null;
    if (systemTracks.length) {
      const source = context.createMediaStreamSource(new MediaStream(systemTracks));
      source.connect(destination);
      systemAnalyser = context.createAnalyser(); systemAnalyser.fftSize = 512;
      source.connect(systemAnalyser);
      nodes.push(source, systemAnalyser);
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
    const systemSamples = systemAnalyser ? new Float32Array(systemAnalyser.fftSize) : null;
    function measure(node, buffer) {
      if (!node) return { active: false, level: 0, peak: 0 };
      node.getFloatTimeDomainData(buffer);
      let sum = 0; let peak = 0;
      for (const value of buffer) { sum += value * value; peak = Math.max(peak, Math.abs(value)); }
      return { active: true, level: Math.min(100, Math.sqrt(sum / buffer.length) * 100), peak: peak * 100 };
    }
    return {
      stream: destination.stream,
      setGain(value) { if (microphoneGain) microphoneGain.gain.value = normalizeMicrophoneGain(value); },
      getLevel() {
        return measure(analyser, samples).level;
      },
      getLevels() { return { microphone: measure(analyser, samples), system: measure(systemAnalyser, systemSamples) }; },
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
