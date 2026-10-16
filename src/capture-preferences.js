'use strict';

window.createCapturePreferences = ({ canEdit, canTestMicrophone, onAudioLevels = () => {} }) => {
  const get = (id) => document.getElementById(id);
  const profile = get('quality-profile');
  const fps = get('frame-rate');
  const size = get('video-size-select');
  const device = get('microphone-device');
  const volume = get('microphone-volume');
  const limit = get('recording-limit');
  const test = get('test-microphone');
  const status = get('microphone-test-status');
  const pairs = [[profile, get('compact-quality-profile')], [fps, get('compact-frame-rate')], [device, get('compact-microphone-device')], [volume, get('compact-microphone-volume')], [limit, get('compact-recording-limit')]];
  let bitrate = 6000000;
  let preview = null;
  let previewVersion = 0;
  let starting = false;
  let meterTimer = null;
  let meterMix = null;
  let deviceRequestVersion = 0;
  const storageKey = 'winscreen-capture-preferences-v1';

  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify({ profile: profile.value, size: size.value, frameRate: Number(fps.value), videoBitsPerSecond: bitrate, device: device.value, volume: Number(volume.value), limitMinutes: Number(limit.value) })); } catch {}
  }
  function syncValues() {
    for (const [primary, compact] of pairs) compact.value = primary.value;
    get('compact-size-select').value = size.value;
    for (const id of ['microphone-volume-value', 'compact-microphone-volume-value']) get(id).textContent = `${volume.value} %`;
    get('quality-hint').textContent = `${bitrate / 1000000} Mbps. La resolución y los FPS dependen de la fuente y del equipo.`;
  }
  function applyProfile() {
    const preset = window.recorderVideoOptions.profiles[profile.value];
    if (preset) { size.value = preset.size; fps.value = String(preset.frameRate); bitrate = preset.videoBitsPerSecond; }
    syncValues(); save();
  }
  function setMessage(message) {
    status.textContent = message;
    get('compact-microphone-test-status').textContent = message;
  }
  function stopMeter() {
    clearInterval(meterTimer);
    meterTimer = null; meterMix = null;
    for (const id of ['microphone-meter', 'compact-microphone-meter']) get(id).value = 0;
    onAudioLevels(null);
  }
  function startMeter(mix) {
    stopMeter(); meterMix = mix;
    meterTimer = setInterval(() => {
      const levels = mix.getLevels();
      const level = levels.microphone.level;
      for (const id of ['microphone-meter', 'compact-microphone-meter']) get(id).value = level;
      onAudioLevels(levels);
    }, 100);
  }
  function stopPreview() {
    previewVersion++;
    if (preview) {
      stopMeter(); preview.mix.dispose();
      preview.stream.getTracks().forEach((track) => track.stop());
      preview.context.close().catch(() => {});
      preview = null;
      setMessage('Prueba finalizada. El micrófono está liberado.');
    }
    for (const button of [test, get('compact-test-microphone')]) button.textContent = 'Probar micrófono';
  }
  function syncAvailability() {
    const editable = canEdit();
    for (const control of [profile, fps, limit, get('compact-recording-limit'), get('compact-quality-profile'), get('compact-frame-rate')]) control.disabled = !editable;
    for (const control of [device, volume, get('compact-microphone-device'), get('compact-microphone-volume')]) control.disabled = !editable || !get('microphone-toggle').checked;
    for (const button of [test, get('compact-test-microphone')]) button.disabled = starting || !canTestMicrophone();
    if (!canTestMicrophone()) stopPreview();
  }
  function microphoneConstraints() {
    return { audio: { ...(device.value ? { deviceId: { exact: device.value } } : {}), echoCancellation: true, noiseSuppression: true, autoGainControl: false }, video: false };
  }
  async function loadDevices() {
    const version = ++deviceRequestVersion;
    try {
      const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((item) => item.kind === 'audioinput' && item.deviceId && item.deviceId !== 'default');
      if (version !== deviceRequestVersion) return;
      const selected = device.value;
      for (const control of [device, get('compact-microphone-device')]) {
        control.replaceChildren(new Option('Predeterminado del sistema', ''));
        inputs.forEach((input, index) => control.add(new Option(input.label || `Micrófono ${index + 1}`, input.deviceId)));
        if (selected && !inputs.some((input) => input.deviceId === selected)) control.add(new Option('Micrófono seleccionado no disponible', selected));
        control.value = selected;
      }
    } catch { setMessage('No se pudo consultar la lista de micrófonos. Revisa los permisos.'); }
  }
  async function togglePreview() {
    if (preview) { stopPreview(); return; }
    if (!canTestMicrophone() || starting) return;
    const version = ++previewVersion;
    starting = true;
    let context;
    let stream;
    try {
      context = new AudioContext();
      const resumed = context.resume();
      stream = await navigator.mediaDevices.getUserMedia(microphoneConstraints());
      await resumed;
      if (version !== previewVersion || !canTestMicrophone()) { stream.getTracks().forEach((track) => track.stop()); await context.close(); return; }
      const mix = window.recorderAudio.createAudioMix({ context, microphoneStream: stream, gain: Number(volume.value) / 100 });
      preview = { stream, context, mix };
      startMeter(mix);
      for (const button of [test, get('compact-test-microphone')]) button.textContent = 'Finalizar prueba';
      setMessage('Prueba activa: habla para comprobar el nivel. Tu voz no se reproduce ni se guarda.');
      await loadDevices();
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      context?.close().catch(() => {});
      setMessage(`No se pudo probar el micrófono: ${error.message}`);
    } finally { starting = false; syncAvailability(); }
  }

  profile.addEventListener('change', applyProfile);
  limit.addEventListener('change', () => { syncValues(); save(); });
  for (const control of [fps, size]) control.addEventListener('change', () => { profile.value = 'custom'; syncValues(); save(); });
  device.addEventListener('change', () => { stopPreview(); syncValues(); save(); });
  volume.addEventListener('input', () => { meterMix?.setGain(Number(volume.value) / 100); syncValues(); save(); });
  for (const [primary, compact] of pairs) compact.addEventListener(primary === volume ? 'input' : 'change', () => { primary.value = compact.value; primary.dispatchEvent(new Event(primary === volume ? 'input' : 'change')); });
  for (const button of [test, get('compact-test-microphone')]) button.addEventListener('click', togglePreview);
  get('microphone-toggle').addEventListener('change', syncAvailability);
  navigator.mediaDevices.addEventListener('devicechange', () => { stopPreview(); void loadDevices(); });
  window.addEventListener('beforeunload', () => { stopPreview(); stopMeter(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopPreview(); });
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    if (stored) {
      const options = window.recorderVideoOptions.normalizeVideoOptions(stored);
      if (!['original', '1080', '720', '480'].includes(stored.size)) throw new Error('Tamaño no válido');
      bitrate = options.videoBitsPerSecond; fps.value = String(options.frameRate); size.value = stored.size;
      window.recorderControls.limitMilliseconds(stored.limitMinutes ?? 0); limit.value = String(stored.limitMinutes ?? 0);
      profile.value = Object.hasOwn(window.recorderVideoOptions.profiles, stored.profile) ? stored.profile : 'custom';
      volume.value = String(window.recorderAudio.normalizeMicrophoneGain(stored.volume / 100) * 100);
      if (typeof stored.device === 'string' && stored.device && stored.device.length < 512) device.add(new Option('Micrófono seleccionado', stored.device, true, true));
    } else applyProfile();
  } catch { profile.value = 'balanced'; applyProfile(); }
  syncValues(); void loadDevices();
  return {
    stopPreview, startMeter, stopMeter, syncAvailability, microphoneConstraints,
    getGain: () => Number(volume.value) / 100,
    getLimitMs: () => window.recorderControls.limitMilliseconds(Number(limit.value)),
    getVideoOptions: () => window.recorderVideoOptions.normalizeVideoOptions({ frameRate: Number(fps.value), videoBitsPerSecond: bitrate })
  };
};
