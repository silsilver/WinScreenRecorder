(() => {
  const elements = {
    statusPill: document.getElementById('status-pill'),
    statusText: document.getElementById('status-text'),
    compactToggle: document.getElementById('compact-toggle'),
    captureMode: document.getElementById('capture-mode-select'),
    compactCaptureMode: document.getElementById('compact-capture-mode-select'),
    captureModeBadge: document.getElementById('capture-mode-badge'),
    captureRegionBadge: document.getElementById('capture-region-badge'),
    regionCapture: document.getElementById('region-capture-toggle'),
    compactRegionCapture: document.getElementById('compact-region-toggle'),
    regionCaptureRow: document.getElementById('region-capture-row'),
    regionDialog: document.getElementById('region-dialog'),
    regionPreviewFrame: document.getElementById('region-preview-frame'),
    regionPreviewVideo: document.getElementById('region-preview-video'),
    regionSelectionBox: document.getElementById('region-selection-box'),
    regionSizeLabel: document.getElementById('region-size-label'),
    confirmRegionSelection: document.getElementById('confirm-region-selection'),
    cancelRegionSelection: document.getElementById('cancel-region-selection'),
    saveDirectoryDisplay: document.getElementById('save-directory-display'),
    chooseSaveDirectory: document.getElementById('choose-save-directory'),
    resetSaveDirectory: document.getElementById('reset-save-directory'),
    compactToolbar: document.getElementById('compact-toolbar'),
    compactSource: document.getElementById('compact-source-select'),
    compactRefresh: document.getElementById('compact-refresh-sources'),
    compactStatusDot: document.getElementById('compact-status-dot'),
    compactStatusText: document.getElementById('compact-status-text'),
    compactTimer: document.getElementById('compact-timer'),
    compactSettings: document.getElementById('compact-settings'),
    compactFormat: document.getElementById('compact-format-select'),
    compactSize: document.getElementById('compact-size-select'),
    compactCountdown: document.getElementById('compact-countdown-select'),
    compactMicrophone: document.getElementById('compact-microphone-toggle'),
    compactSystemAudio: document.getElementById('compact-system-audio-toggle'),
    compactStart: document.getElementById('compact-start'),
    compactCancelCountdown: document.getElementById('compact-cancel-countdown'),
    compactStop: document.getElementById('compact-stop'),
    compactSave: document.getElementById('compact-save'),
    compactDiscard: document.getElementById('compact-discard'),
    compactExpand: document.getElementById('compact-expand'),
    developerInfoButton: document.getElementById('developer-info-button'),
    developerDialog: document.getElementById('developer-dialog'),
    closeDeveloperDialog: document.getElementById('close-developer-dialog'),
    developerName: document.getElementById('developer-name'),
    developerEmail: document.getElementById('developer-email'),
    developerVersion: document.getElementById('developer-version'),
    timer: document.getElementById('timer'),
    format: document.getElementById('format-select'),
    videoSize: document.getElementById('video-size-select'),
    countdown: document.getElementById('countdown-select'),
    microphone: document.getElementById('microphone-toggle'),
    systemAudio: document.getElementById('system-audio-toggle'),
    systemAudioRow: document.getElementById('system-audio-row'),
    systemAudioHint: document.getElementById('system-audio-hint'),
    sourceGrid: document.getElementById('source-grid'),
    captureArea: document.getElementById('capture-area'),
    sourceError: document.getElementById('source-error'),
    selectionNote: document.getElementById('selection-note'),
    refresh: document.getElementById('refresh-sources'),
    idleActions: document.getElementById('idle-actions'),
    countdownActions: document.getElementById('countdown-actions'),
    countdownNumber: document.getElementById('countdown-number'),
    countdownCopy: document.getElementById('countdown-copy'),
    recordingActions: document.getElementById('recording-actions'),
    saveActions: document.getElementById('save-actions'),
    saveTitle: document.getElementById('save-title'),
    saveDescription: document.getElementById('save-description'),
    saveProgress: document.getElementById('save-progress'),
    start: document.getElementById('start-recording'),
    cancelCountdown: document.getElementById('cancel-countdown'),
    stop: document.getElementById('stop-recording'),
    save: document.getElementById('save-recording'),
    saveWebm: document.getElementById('save-webm'),
    discard: document.getElementById('discard-recording')
  };

  const state = {
    sources: [],
    selectedSourceId: null,
    phase: 'idle',
    captureStream: null,
    displayStream: null,
    microphoneStream: null,
    mediaRecorder: null,
    recordingId: null,
    audioContext: null,
    countdownTimer: null,
    timerInterval: null,
    startedAt: 0,
    chunkQueue: Promise.resolve(),
    pendingChunkBytes: 0,
    pausedAt: 0,
    pausedDuration: 0,
    chunkError: null,
    stopping: false,
    hasAudio: false,
    captureConfigReady: false,
    captureConfigVersion: 0,
    captureConfigQueue: Promise.resolve(),
    systemAudioAvailable: false,
    captureStep: 'display',
    developerInfo: null,
    regionRect: null,
    regionAnimationId: null,
    cropCanvas: null,
    cropVideo: null,
    regionDragStart: null,
    regionPendingRect: null,
    resolveRegionSelection: null
  };

  const busyPhases = new Set(['loading', 'preparing', 'countdown', 'capturing-image', 'recording', 'finalizing', 'saving']);
  const compactPreferenceKey = 'winscreen-recorder-compact';
  const videoFormats = [
    ['mp4', 'MP4 · H.264'], ['mkv', 'MKV · H.264'], ['webm', 'WebM · VP9 / VP8'], ['gif', 'GIF animado']
  ];
  const imageFormats = [['png', 'PNG · Sin pérdida'], ['jpg', 'JPG · Alta calidad']];

  function populateFormatOptions(mode, preferredValue) {
    const options = mode === 'image' ? imageFormats : videoFormats;
    for (const select of [elements.format, elements.compactFormat]) {
      select.replaceChildren(...options.map(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
      }));
      select.value = options.some(([value]) => value === preferredValue) ? preferredValue : options[0][0];
    }
  }

  function setCaptureMode(mode) {
    const isImage = mode === 'image';
    document.body.classList.toggle('image-mode', isImage);
    elements.captureMode.value = isImage ? 'image' : 'video';
    elements.compactCaptureMode.value = elements.captureMode.value;
    elements.captureModeBadge.textContent = isImage ? 'IMAGEN' : 'VIDEO';
    elements.captureModeBadge.className = `capture-mode-badge ${isImage ? 'is-image' : 'is-video'}`;
    document.querySelector('.intro h2').textContent = isImage ? 'Prepara tu imagen' : 'Prepara tu grabación';
    document.querySelector('.intro-copy').textContent = isImage
      ? 'Elige una pantalla o porción y ajusta el tamaño de la imagen.'
      : 'Elige una pantalla o ventana y ajusta el audio antes de empezar.';
    elements.countdownCopy.firstChild.textContent = isImage ? 'La imagen se captura en ' : 'La grabación comienza en ';
    const preferred = elements.format.value;
    populateFormatOptions(isImage ? 'image' : 'video', preferred);
    const audioDisabled = isImage || state.phase !== 'idle';
    elements.microphone.disabled = audioDisabled;
    elements.systemAudio.disabled = audioDisabled || !state.systemAudioAvailable;
    elements.systemAudioRow.classList.toggle('is-disabled', isImage || !state.systemAudioAvailable);
    elements.systemAudioHint.textContent = isImage
      ? 'El audio solo se incluye en capturas de video.'
      : state.systemAudioAvailable ? 'Disponible en Windows.' : 'El audio del sistema requiere Windows.';
    elements.microphone.closest('.toggle-row').querySelector('.toggle-detail').textContent = isImage
      ? 'Disponible al capturar video'
      : 'Incluir mi voz';
    elements.compactMicrophone.disabled = audioDisabled;
    elements.compactSystemAudio.disabled = audioDisabled || !state.systemAudioAvailable;
    elements.start.innerHTML = isImage
      ? '<span aria-hidden="true">▧</span> Capturar imagen'
      : '<span class="record-icon" aria-hidden="true"></span> Iniciar grabación';
    elements.compactStart.innerHTML = isImage
      ? '<span aria-hidden="true">▧</span> Capturar'
      : '<span class="record-icon" aria-hidden="true"></span> Grabar';
    elements.compactSize.closest('.compact-setting-field').firstChild.textContent = isImage ? 'Tamaño de imagen' : 'Tamaño';
    elements.videoSize.previousElementSibling.textContent = isImage ? 'Tamaño de imagen' : 'Tamaño del video';
    elements.regionCapture.checked = elements.compactRegionCapture.checked;
    syncRegionControlAvailability();
  }

  function syncRegionControlAvailability() {
    const selected = state.sources.find((source) => source.id === state.selectedSourceId);
    const isScreen = Boolean(selected?.id.startsWith('screen:'));
    if (!isScreen) {
      elements.regionCapture.checked = false;
      elements.compactRegionCapture.checked = false;
      if (state.regionRect) {
        state.regionRect = null;
        elements.captureRegionBadge.hidden = true;
        updateRegionHighlight();
      }
    }
    const disabled = !isScreen || state.phase !== 'idle';
    elements.regionCapture.disabled = disabled;
    elements.compactRegionCapture.disabled = disabled;
    elements.regionCaptureRow.classList.toggle('is-disabled', disabled);
    elements.regionCaptureRow.title = isScreen ? '' : 'Selecciona una pantalla para capturar una porción.';
  }

  async function setCompactMode(enabled, persist = true) {
    try {
      if (elements.compactSettings.open) {
        elements.compactSettings.open = false;
        await window.electronAPI.setCompactSettingsOpen(false);
      }
      await window.electronAPI.setCompactMode(enabled);
    } catch (error) {
      setStatus(`No se pudo cambiar la vista: ${error.message}`);
      return;
    }
    document.body.classList.toggle('compact-mode', enabled);
    elements.compactToolbar.hidden = !enabled;
    elements.compactToggle.setAttribute('aria-pressed', String(enabled));
    elements.compactToggle.textContent = enabled ? 'Vista completa' : 'Mini barra';
    if (persist) {
      try { window.localStorage.setItem(compactPreferenceKey, String(enabled)); } catch {}
    }
  }

  async function initializeCompactMode() {
    let enabled = false;
    try { enabled = window.localStorage.getItem(compactPreferenceKey) === 'true'; } catch {}
    if (enabled) await setCompactMode(true, false);
  }

  function setStatus(message, kind = '') {
    elements.statusText.textContent = message;
    elements.statusPill.className = `status-pill${kind ? ` is-${kind}` : ''}`;
    elements.compactStatusText.textContent = message;
    elements.compactStatusDot.className = `compact-status-dot${kind ? ` is-${kind}` : ''}`;
  }

  function updateSaveDirectoryDisplay(status) {
    const directory = status?.directory;
    elements.saveDirectoryDisplay.textContent = !directory
      ? 'Preguntar dónde guardar cada vez'
      : status.available
        ? directory
        : `Carpeta no disponible: ${directory}`;
    elements.saveDirectoryDisplay.classList.toggle('is-unavailable', Boolean(directory && !status.available));
    elements.resetSaveDirectory.hidden = !status?.custom;
  }

  async function loadSaveDirectory() {
    try {
      updateSaveDirectoryDisplay(await window.electronAPI.getSaveDirectory());
    } catch (error) {
      elements.saveDirectoryDisplay.textContent = `No se pudo leer la carpeta: ${error.message}`;
    }
  }

  function captureErrorMessage(error) {
    if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
      if (state.captureStep === 'microphone') {
        return 'Windows bloqueó el micrófono. En Configuración > Privacidad y seguridad > Micrófono, habilita el acceso al micrófono y a las aplicaciones de escritorio.';
      }
      if (state.captureStep === 'display') {
        const nativeDetail = typeof error?.message === 'string' && error.message.trim()
          ? ` Detalle de Electron: ${error.message.trim()}`
          : '';
        return `Electron bloqueó el acceso a la pantalla o ventana (${error.name}).${nativeDetail} Actualiza las fuentes y vuelve a intentarlo.`;
      }
    }
    if (state.captureStep === 'display' && error?.name) {
      const nativeDetail = typeof error.message === 'string' && error.message.trim()
        ? `: ${error.message.trim()}`
        : '';
      return `Falló la captura de pantalla (${error.name})${nativeDetail}.`;
    }
    return error?.message || 'Ocurrió un error al iniciar la captura.';
  }

  const saveProgressMessages = {
    'model-download': 'Descargando el modelo local de transcripción…',
    'audio-preparation': 'Preparando el audio para transcribir…',
    transcription: 'Transcribiendo en este equipo…',
    finalizing: 'Guardando video y subtítulos…'
  };

  window.electronAPI.onSaveProgress((progress) => {
    const message = saveProgressMessages[progress?.stage];
    if (!message) return;
    elements.saveProgress.textContent = message;
    elements.saveProgress.hidden = false;
    setStatus(message, 'busy');
  });

  function updateTimer() {
    const activePause = state.pausedAt ? Date.now() - state.pausedAt : 0;
    const totalSeconds = Math.max(0, Math.floor((Date.now() - state.startedAt - state.pausedDuration - activePause) / 1000));
    elements.timer.textContent = `${Math.floor(totalSeconds / 60).toString().padStart(2, '0')}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
    elements.compactTimer.textContent = elements.timer.textContent;
  }

  function setPhase(phase) {
    state.phase = phase;
    elements.idleActions.hidden = phase !== 'idle';
    elements.countdownActions.hidden = phase !== 'countdown';
    elements.recordingActions.hidden = phase !== 'recording' && phase !== 'finalizing';
    elements.saveActions.hidden = phase !== 'ready' && phase !== 'saving';

    const controlsDisabled = busyPhases.has(phase) || phase === 'ready';
    const imageMode = elements.captureMode.value === 'image';
    const countdownDisabled = controlsDisabled || imageMode;
    elements.captureMode.disabled = controlsDisabled;
    elements.compactCaptureMode.disabled = controlsDisabled;
    elements.format.disabled = controlsDisabled;
    elements.videoSize.disabled = controlsDisabled;
    elements.countdown.disabled = countdownDisabled;
    elements.compactCountdown.disabled = countdownDisabled;
    elements.countdown.previousElementSibling.classList.toggle('is-disabled', countdownDisabled);
    elements.compactCountdown.closest('.compact-setting-field').classList.toggle('is-disabled', countdownDisabled);
    elements.microphone.disabled = controlsDisabled || elements.captureMode.value === 'image';
    elements.systemAudio.disabled = controlsDisabled || elements.captureMode.value === 'image' || !state.systemAudioAvailable;
    elements.compactMicrophone.disabled = controlsDisabled || elements.captureMode.value === 'image';
    elements.compactSystemAudio.disabled = controlsDisabled || elements.captureMode.value === 'image' || !state.systemAudioAvailable;
    elements.chooseSaveDirectory.disabled = controlsDisabled;
    elements.resetSaveDirectory.disabled = controlsDisabled;
    elements.refresh.disabled = controlsDisabled;
    elements.start.disabled = !state.selectedSourceId || !state.captureConfigReady || phase !== 'idle';
    elements.stop.disabled = phase !== 'recording';
    syncRegionControlAvailability();
    elements.cancelCountdown.disabled = phase !== 'countdown';
    elements.save.disabled = phase !== 'ready';
    elements.saveWebm.disabled = phase !== 'ready';
    elements.discard.disabled = phase !== 'ready';
    elements.compactSource.disabled = controlsDisabled || !state.sources.length;
    elements.compactRefresh.disabled = controlsDisabled;
    elements.compactSettings.inert = controlsDisabled;
    elements.compactStart.hidden = phase !== 'idle';
    elements.compactStart.disabled = elements.start.disabled;
    elements.compactCancelCountdown.hidden = phase !== 'countdown';
    elements.compactStop.hidden = phase !== 'recording' && phase !== 'finalizing';
    elements.compactStop.disabled = phase !== 'recording';
    elements.compactSave.hidden = phase !== 'ready' && phase !== 'saving';
    elements.compactSave.disabled = phase !== 'ready';
    elements.compactSave.textContent = phase === 'saving' ? 'Procesando…' : (elements.saveWebm.hidden ? 'Guardar' : 'Guardar WebM');
    elements.compactDiscard.hidden = phase !== 'ready';
    elements.compactDiscard.disabled = phase !== 'ready';
    if (controlsDisabled && elements.compactSettings.open) elements.compactSettings.open = false;
    elements.save.textContent = phase === 'saving' ? 'Procesando…' : `Guardar ${elements.format.value.toUpperCase()}`;
    const captureAreaDisabled = controlsDisabled;
    elements.captureArea.classList.toggle('is-locked', captureAreaDisabled);
    elements.captureArea.setAttribute('aria-disabled', String(captureAreaDisabled));

    for (const card of elements.sourceGrid.querySelectorAll('.source-card')) {
      card.disabled = controlsDisabled;
    }
  }

  function renderSources() {
    elements.sourceGrid.replaceChildren();
    elements.compactSource.replaceChildren();
    if (state.sources.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.textContent = 'No se encontraron pantallas ni ventanas.';
      elements.sourceGrid.append(emptyState);
      elements.selectionNote.textContent = 'No hay fuentes disponibles';
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No hay fuentes disponibles';
      elements.compactSource.append(option);
      elements.start.disabled = true;
      return;
    }

    for (const source of state.sources) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `source-card${source.id === state.selectedSourceId ? ' is-selected' : ''}`;
      card.setAttribute('aria-pressed', source.id === state.selectedSourceId ? 'true' : 'false');

      const preview = document.createElement('span');
      preview.className = 'source-preview';
      if (source.thumbnail) {
        const image = document.createElement('img');
        image.src = source.thumbnail;
        image.alt = '';
        image.draggable = false;
        preview.append(image);
      }
      const type = document.createElement('span');
      type.className = 'source-type';
      type.textContent = source.id.startsWith('screen:') ? 'PANTALLA' : 'VENTANA';
      preview.append(type);

      const name = document.createElement('span');
      name.className = 'source-name';
      name.textContent = source.name || 'Fuente sin nombre';
      card.append(preview, name);
      card.addEventListener('click', () => selectSource(source.id));
      elements.sourceGrid.append(card);

      const option = document.createElement('option');
      option.value = source.id;
      option.textContent = source.name || 'Fuente sin nombre';
      elements.compactSource.append(option);
    }

    elements.compactSource.value = state.selectedSourceId || '';

    const selected = state.sources.find((source) => source.id === state.selectedSourceId);
    elements.selectionNote.textContent = selected ? `Capturando: ${selected.name}` : 'Selecciona una fuente para continuar';
    elements.start.disabled = !state.selectedSourceId || !state.captureConfigReady || state.phase !== 'idle';
    updateRegionHighlight();
  }

  async function syncCaptureOptions() {
    if (!state.selectedSourceId) {
      state.captureConfigReady = false;
      elements.compactStart.disabled = true;
      return;
    }

    const requestVersion = ++state.captureConfigVersion;
    state.captureConfigReady = false;
    elements.start.disabled = true;
    elements.compactStart.disabled = true;
    const options = {
      sourceId: state.selectedSourceId,
      systemAudio: elements.captureMode.value === 'video' && elements.systemAudio.checked,
      microphone: elements.captureMode.value === 'video' && elements.microphone.checked
    };

    try {
      state.captureConfigQueue = state.captureConfigQueue.catch(() => {}).then(() => window.electronAPI.configureCapture(options));
      const capabilities = await state.captureConfigQueue;
      if (requestVersion !== state.captureConfigVersion) return;
      state.systemAudioAvailable = capabilities.systemAudioAvailable;
      elements.systemAudioRow.classList.toggle('is-disabled', !state.systemAudioAvailable || elements.captureMode.value === 'image');
      elements.systemAudioHint.textContent = state.systemAudioAvailable
        ? 'Disponible en Windows.'
        : 'El audio del sistema requiere Windows.';
      elements.systemAudio.disabled = !state.systemAudioAvailable || state.phase !== 'idle' || elements.captureMode.value === 'image';
      if (!state.systemAudioAvailable) elements.systemAudio.checked = false;
      elements.compactMicrophone.checked = elements.microphone.checked;
      elements.compactSystemAudio.checked = elements.systemAudio.checked;
      elements.compactSystemAudio.disabled = !state.systemAudioAvailable || state.phase !== 'idle' || elements.captureMode.value === 'image';
      state.captureConfigReady = true;
      elements.start.disabled = !state.selectedSourceId || state.phase !== 'idle';
      elements.compactStart.disabled = elements.start.disabled;
    } catch (error) {
      if (requestVersion === state.captureConfigVersion) {
        elements.sourceError.textContent = error.message;
        elements.sourceError.hidden = false;
        state.captureConfigReady = false;
      }
    }
  }

  async function selectSource(sourceId) {
    state.selectedSourceId = sourceId;
    state.captureConfigReady = false;
    renderSources();
    await syncCaptureOptions();
    renderSources();
  }

  async function loadSources() {
    if (busyPhases.has(state.phase) || state.phase === 'ready') return;
    state.phase = 'loading';
    state.captureConfigReady = false;
    elements.sourceGrid.setAttribute('aria-busy', 'true');
    elements.sourceGrid.replaceChildren();
    const loader = document.createElement('div');
    loader.className = 'empty-state';
    loader.textContent = 'Buscando pantallas y ventanas…';
    elements.sourceGrid.append(loader);
    elements.sourceError.hidden = true;
    setPhase('loading');

    try {
      state.sources = await window.electronAPI.getSources();
      if (!state.sources.some((source) => source.id === state.selectedSourceId)) {
        state.selectedSourceId = state.sources[0]?.id ?? null;
      }
      await syncCaptureOptions();
      setStatus(state.sources.length ? 'Listo para grabar' : 'No hay fuentes disponibles');
    } catch (error) {
      state.sources = [];
      state.selectedSourceId = null;
      elements.sourceError.textContent = `No se pudieron cargar las fuentes: ${error.message}`;
      elements.sourceError.hidden = false;
      setStatus('No se pudieron cargar las fuentes');
    } finally {
      elements.sourceGrid.setAttribute('aria-busy', 'false');
      setPhase('idle');
      renderSources();
    }
  }

  function chooseRecorderMimeType() {
    return ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      .find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? '';
  }

  async function acquireCapture() {
    const isVideo = elements.captureMode.value === 'video';
    const wantsSystemAudio = isVideo && state.systemAudioAvailable && elements.systemAudio.checked;
    const wantsMicrophone = isVideo && elements.microphone.checked;
    const sizeCaps = {
      1080: { width: 1920, height: 1080 },
      720: { width: 1280, height: 720 },
      480: { width: 854, height: 480 }
    };
    const sizeCap = sizeCaps[elements.videoSize.value];
    // Keep this call in the Start button's gesture so Electron can grant the selected source.
    state.captureStep = 'display';
    const displayPromise = navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 30, max: 60 },
        ...(sizeCap ? { width: { max: sizeCap.width }, height: { max: sizeCap.height } } : {})
      },
      audio: wantsSystemAudio
    });
    let audioContextReady = Promise.resolve();
    if (wantsSystemAudio && wantsMicrophone) {
      state.audioContext = new AudioContext();
      audioContextReady = state.audioContext.resume();
    }
    const displayStream = await displayPromise;
    state.displayStream = displayStream;

    try {
      if (wantsMicrophone) {
        state.captureStep = 'microphone';
        state.microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
      await audioContextReady;
    } catch (error) {
      stopTracks();
      throw error;
    }

    const videoTracks = displayStream.getVideoTracks();
    const systemTracks = displayStream.getAudioTracks();
    const microphoneTracks = state.microphoneStream?.getAudioTracks() ?? [];
    if (videoTracks.length === 0) throw new Error('Windows no proporcionó una pista de video.');
    if (wantsSystemAudio && systemTracks.length === 0) {
      throw new Error('Windows no proporcionó una pista de audio del sistema. Desactiva esa opción o revisa el dispositivo de salida.');
    }
    if (wantsMicrophone && microphoneTracks.length === 0) {
      throw new Error('No se encontró una pista de micrófono. Revisa los permisos y el dispositivo de entrada.');
    }

    const audioTracks = [...systemTracks, ...microphoneTracks];
    const combinedTracks = [...videoTracks];
    if (audioTracks.length === 1) {
      combinedTracks.push(audioTracks[0]);
    } else if (audioTracks.length > 1) {
      const destination = state.audioContext.createMediaStreamDestination();
      for (const track of audioTracks) {
        const source = state.audioContext.createMediaStreamSource(new MediaStream([track]));
        source.connect(destination);
      }
      combinedTracks.push(destination.stream.getAudioTracks()[0]);
    }
    state.captureStream = new MediaStream(combinedTracks);
    state.hasAudio = audioTracks.length > 0;
  }

  function waitForVideoReady(video) {
    if (video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('No se pudo preparar la vista previa de la pantalla.')), 10000);
      video.addEventListener('loadedmetadata', () => { window.clearTimeout(timer); resolve(); }, { once: true });
      video.addEventListener('error', () => { window.clearTimeout(timer); reject(new Error('No se pudo leer la vista previa de la pantalla.')); }, { once: true });
    });
  }

  function setRegionPreviewAspect() {
    const video = elements.regionPreviewVideo;
    if (!video.videoWidth || !video.videoHeight) return;
    elements.regionPreviewFrame.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    const scale = Math.min(
      (elements.regionDialog.clientWidth - 44) / video.videoWidth,
      window.innerHeight * .65 / video.videoHeight
    );
    elements.regionPreviewFrame.style.width = `${Math.floor(video.videoWidth * scale)}px`;
    elements.regionPreviewFrame.style.height = `${Math.floor(video.videoHeight * scale)}px`;
  }

  function updateRegionHighlight() {
    for (const overlay of elements.sourceGrid.querySelectorAll('.capture-region-overlay')) overlay.remove();
    const selectedCard = [...elements.sourceGrid.querySelectorAll('.source-card')]
      .find((card) => card.getAttribute('aria-pressed') === 'true');
    const preview = selectedCard?.querySelector('.source-preview');
    if (!preview || !state.regionRect || !elements.regionPreviewVideo.videoWidth || !elements.regionPreviewVideo.videoHeight) return;
    const overlay = document.createElement('span');
    overlay.className = 'capture-region-overlay';
    overlay.setAttribute('aria-label', 'Porción seleccionada');
    overlay.style.left = `${100 * state.regionRect.x / elements.regionPreviewVideo.videoWidth}%`;
    overlay.style.top = `${100 * state.regionRect.y / elements.regionPreviewVideo.videoHeight}%`;
    overlay.style.width = `${100 * state.regionRect.width / elements.regionPreviewVideo.videoWidth}%`;
    overlay.style.height = `${100 * state.regionRect.height / elements.regionPreviewVideo.videoHeight}%`;
    preview.append(overlay);
  }

  function updateRegionSelection(event) {
    if (!state.regionDragStart) return;
    const bounds = elements.regionPreviewVideo.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
    const currentY = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    const left = Math.min(state.regionDragStart.x, currentX);
    const top = Math.min(state.regionDragStart.y, currentY);
    const width = Math.abs(currentX - state.regionDragStart.x);
    const height = Math.abs(currentY - state.regionDragStart.y);
    elements.regionSelectionBox.hidden = false;
    elements.regionSelectionBox.style.left = `${left}px`;
    elements.regionSelectionBox.style.top = `${top}px`;
    elements.regionSelectionBox.style.width = `${width}px`;
    elements.regionSelectionBox.style.height = `${height}px`;
    const scaleX = elements.regionPreviewVideo.videoWidth / bounds.width;
    const scaleY = elements.regionPreviewVideo.videoHeight / bounds.height;
    state.regionPendingRect = {
      x: Math.floor(left * scaleX),
      y: Math.floor(top * scaleY),
      width: Math.floor(width * scaleX),
      height: Math.floor(height * scaleY)
    };
    const valid = state.regionPendingRect.width >= 16 && state.regionPendingRect.height >= 16;
    elements.confirmRegionSelection.disabled = !valid;
    elements.regionSizeLabel.textContent = valid
      ? `${state.regionPendingRect.width} × ${state.regionPendingRect.height} píxeles`
      : 'Marca un área de al menos 16 × 16 píxeles';
  }

  function finishRegionSelection(rectangle) {
    if (!state.resolveRegionSelection) return;
    const resolve = state.resolveRegionSelection;
    state.resolveRegionSelection = null;
    if (elements.regionDialog.open) elements.regionDialog.close();
    resolve(rectangle);
  }

  async function chooseCaptureRegion() {
    const videoTrack = state.displayStream?.getVideoTracks()[0];
    if (!videoTrack) throw new Error('No se encontró la pantalla para seleccionar una porción.');
    elements.regionPreviewVideo.srcObject = new MediaStream([videoTrack]);
    elements.regionDialog.showModal();
    await elements.regionPreviewVideo.play();
    await waitForVideoReady(elements.regionPreviewVideo);
    setRegionPreviewAspect();
    state.regionDragStart = null;
    state.regionPendingRect = null;
    elements.regionSelectionBox.hidden = true;
    elements.confirmRegionSelection.disabled = true;
    elements.regionSizeLabel.textContent = 'Marca un área';
    return new Promise((resolve) => { state.resolveRegionSelection = resolve; });
  }

  async function applyRegionToVideo(rectangle) {
    const video = elements.regionPreviewVideo;
    const canvas = document.createElement('canvas');
    canvas.width = rectangle.width;
    canvas.height = rectangle.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('No se pudo preparar el recorte de video.');
    state.cropCanvas = canvas;
    state.cropVideo = video;
    const drawFrame = () => {
      if (!state.cropCanvas) return;
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        context.drawImage(video, rectangle.x, rectangle.y, rectangle.width, rectangle.height, 0, 0, canvas.width, canvas.height);
      }
      state.regionAnimationId = requestAnimationFrame(drawFrame);
    };
    drawFrame();
    const croppedStream = canvas.captureStream(30);
    const audioTracks = state.captureStream.getAudioTracks();
    state.captureStream = new MediaStream([...croppedStream.getVideoTracks(), ...audioTracks]);
  }

  function getImageDimensions(width, height) {
    const caps = {
      1080: { width: 1920, height: 1080 },
      720: { width: 1280, height: 720 },
      480: { width: 854, height: 480 }
    };
    const cap = caps[elements.videoSize.value];
    if (!cap) return { width, height };
    const scale = Math.min(1, cap.width / width, cap.height / height);
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }

  async function captureAndSaveImage() {
    const video = elements.regionPreviewVideo;
    if (!video.srcObject) video.srcObject = new MediaStream([state.displayStream.getVideoTracks()[0]]);
    if (video.paused) await video.play();
    await waitForVideoReady(video);
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    const region = state.regionRect;
    const sourceX = region?.x ?? 0;
    const sourceY = region?.y ?? 0;
    const sourceWidth = region?.width ?? video.videoWidth;
    const sourceHeight = region?.height ?? video.videoHeight;
    const dimensions = getImageDimensions(sourceWidth, sourceHeight);
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d', { alpha: elements.format.value === 'png' });
    if (!context) throw new Error('No se pudo preparar la imagen.');
    context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    const mimeType = elements.format.value === 'png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((resolve, reject) => canvas.toBlob((image) => image ? resolve(image) : reject(new Error('No se pudo generar el archivo de imagen.')), mimeType, .92));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const selectedSource = state.sources.find((source) => source.id === state.selectedSourceId);
    const result = await window.electronAPI.saveImage(bytes, elements.format.value, selectedSource?.name || 'grabacion');
    elements.selectionNote.textContent = `Imagen guardada: ${result.path}`;
    setStatus('Imagen guardada', 'ready');
  }

  function stopTracks() {
    if (state.resolveRegionSelection) finishRegionSelection(null);
    else if (elements.regionDialog.open) elements.regionDialog.close();
    if (state.regionAnimationId) cancelAnimationFrame(state.regionAnimationId);
    state.regionAnimationId = null;
    state.cropCanvas = null;
    state.cropVideo = null;
    const tracks = new Set([
      ...(state.captureStream?.getTracks() ?? []),
      ...(state.displayStream?.getTracks() ?? []),
      ...(state.microphoneStream?.getTracks() ?? [])
    ]);
    tracks.forEach((track) => track.stop());
    state.captureStream = null;
    state.displayStream = null;
    state.microphoneStream = null;
    elements.regionPreviewVideo.pause();
    elements.regionPreviewVideo.srcObject = null;
    if (state.audioContext && state.audioContext.state !== 'closed') state.audioContext.close().catch(() => {});
    state.audioContext = null;
  }

  async function startCountdownAndRecord() {
    if (state.phase !== 'idle' || !state.selectedSourceId || !state.captureConfigReady) return;
    state.phase = 'preparing';
    setPhase('preparing');
    setStatus('Solicitando acceso a la captura…', 'busy');
    elements.sourceError.hidden = true;

    try {
      // acquireCapture calls getDisplayMedia before its first await, preserving the user gesture.
      const capturePromise = acquireCapture();
      await capturePromise;
      state.regionRect = null;
      elements.captureRegionBadge.hidden = true;
      if (elements.regionCapture.checked) {
        const region = await chooseCaptureRegion();
        if (!region) {
          stopTracks();
          elements.captureRegionBadge.hidden = true;
          state.phase = 'idle';
          setPhase('idle');
          setStatus('Selección de porción cancelada');
          return;
        }
        state.regionRect = region;
        elements.captureRegionBadge.textContent = `PORCIÓN ${region.width} × ${region.height}`;
        elements.captureRegionBadge.hidden = false;
        updateRegionHighlight();
        if (elements.captureMode.value === 'video') await applyRegionToVideo(region);
      }
      const isImage = elements.captureMode.value === 'image';
      const seconds = isImage ? 0 : Number.parseInt(elements.countdown.value, 10) || 0;
      if (seconds > 0) {
        state.phase = 'countdown';
        let remaining = seconds;
        elements.countdownNumber.textContent = String(remaining);
        setPhase('countdown');
        setStatus('Cuenta atrás', 'busy');
        state.countdownTimer = window.setInterval(() => {
          remaining -= 1;
          elements.countdownNumber.textContent = String(Math.max(remaining, 0));
          if (remaining <= 0) {
            window.clearInterval(state.countdownTimer);
            state.countdownTimer = null;
            completeCaptureAfterCountdown();
          }
        }, 1000);
      } else {
        if (elements.captureMode.value === 'image') await captureImageWorkflow();
        else await beginMediaRecording();
      }
    } catch (error) {
      await handleCaptureError(error);
    }
  }

  async function completeCaptureAfterCountdown() {
    if (elements.captureMode.value === 'image') await captureImageWorkflow();
    else await beginMediaRecording().catch(handleCaptureError);
  }

  async function captureImageWorkflow() {
    state.phase = 'capturing-image';
    setPhase('capturing-image');
    try {
      setStatus('Generando imagen…', 'busy');
      await captureAndSaveImage();
    } catch (error) {
      await handleCaptureError(error);
    } finally {
      stopTracks();
      state.regionRect = null;
      elements.captureRegionBadge.hidden = true;
      updateRegionHighlight();
      state.phase = 'idle';
      setPhase('idle');
    }
  }

  async function beginMediaRecording() {
    if (state.phase !== 'countdown' && state.phase !== 'preparing') return;
    state.captureStep = 'recording';
    const mimeType = chooseRecorderMimeType();
    if (!mimeType) throw new Error('Este sistema no ofrece un formato WebM compatible para grabar.');

    state.recordingId = await window.electronAPI.beginRecording();
    state.chunkQueue = Promise.resolve();
    state.pendingChunkBytes = 0;
    state.pausedAt = 0;
    state.pausedDuration = 0;
    state.chunkError = null;
    state.stopping = false;
    state.mediaRecorder = new MediaRecorder(state.captureStream, { mimeType });
    state.mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data.size === 0 || !state.recordingId) return;
      state.pendingChunkBytes += event.data.size;
      if (state.pendingChunkBytes >= 24 * 1024 * 1024 && state.mediaRecorder.state === 'recording') {
        state.mediaRecorder.pause();
        state.pausedAt = Date.now();
        setStatus('Guardando datos…', 'busy');
      }
      state.chunkQueue = state.chunkQueue.then(async () => {
        const bytes = new Uint8Array(await event.data.arrayBuffer());
        await window.electronAPI.appendRecordingChunk(state.recordingId, bytes);
        state.pendingChunkBytes = Math.max(0, state.pendingChunkBytes - event.data.size);
        if (state.pendingChunkBytes <= 8 * 1024 * 1024 && state.mediaRecorder.state === 'paused' && !state.stopping) {
          state.pausedDuration += Date.now() - state.pausedAt;
          state.pausedAt = 0;
          state.mediaRecorder.resume();
          setStatus('Grabando ahora', 'recording');
        }
      }).catch((error) => {
        state.pendingChunkBytes = 0;
        state.chunkError = error;
        requestStopRecording();
      });
    });
    state.mediaRecorder.addEventListener('error', (event) => {
      state.chunkError = event.error || new Error('Falló la captura de medios.');
      requestStopRecording();
    }, { once: true });
    state.mediaRecorder.addEventListener('stop', finishMediaRecording, { once: true });
    state.captureStream.getVideoTracks()[0].addEventListener('ended', requestStopRecording, { once: true });
    state.displayStream.getVideoTracks()[0].addEventListener('ended', requestStopRecording, { once: true });

    state.mediaRecorder.start(1000);
    state.startedAt = Date.now();
    state.timerInterval = window.setInterval(updateTimer, 250);
    updateTimer();
    state.phase = 'recording';
    setPhase('recording');
    setStatus('Grabando ahora', 'recording');
  }

  function requestStopRecording() {
    if (state.phase === 'recording') stopRecording();
  }

  function stopRecording() {
    if (!['recording', 'finalizing'].includes(state.phase) || state.stopping) return;
    state.stopping = true;
    state.phase = 'finalizing';
    setPhase('finalizing');
    setStatus('Finalizando la grabación…', 'busy');
    if (state.timerInterval) {
      window.clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
    if (state.pausedAt) {
      state.pausedDuration += Date.now() - state.pausedAt;
      state.pausedAt = 0;
    }
    if (['recording', 'paused'].includes(state.mediaRecorder?.state)) state.mediaRecorder.stop();
  }

  async function finishMediaRecording() {
    stopTracks();
    await state.chunkQueue;
    if (state.timerInterval) {
      window.clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
    updateTimer();

    if (!state.recordingId) {
      state.phase = 'idle';
      setPhase('idle');
      return;
    }
    if (state.chunkError) {
      try {
        await window.electronAPI.completeRecording(state.recordingId, state.hasAudio);
        await window.electronAPI.discardRecording(state.recordingId);
      } catch {
        // The main process discards a session whose disk write failed.
      }
      state.recordingId = null;
      state.phase = 'idle';
      setPhase('idle');
      setStatus('No se pudo escribir la grabación');
      elements.sourceError.textContent = `No se pudo guardar temporalmente la captura: ${state.chunkError.message}`;
      elements.sourceError.hidden = false;
      return;
    }

    try {
      await window.electronAPI.completeRecording(state.recordingId, state.hasAudio);
      state.phase = 'ready';
      elements.saveTitle.textContent = 'Tu captura está lista';
      elements.saveDescription.textContent = 'Elige dónde guardarla. La transcripción con audio se generará automáticamente.';
      elements.saveWebm.hidden = true;
      elements.saveWebm.textContent = 'Guardar original WebM';
      elements.saveProgress.hidden = true;
      setPhase('ready');
      await saveCurrentRecording(elements.format.value);
    } catch (error) {
      state.recordingId = null;
      state.phase = 'idle';
      setPhase('idle');
      setStatus('No se pudo completar la grabación');
      elements.sourceError.textContent = error.message;
      elements.sourceError.hidden = false;
    }
  }

  async function saveCurrentRecording(format) {
    if (state.phase !== 'ready' || !state.recordingId) return;
    state.phase = 'saving';
    setPhase('saving');
    elements.saveProgress.hidden = true;
    setStatus('Preparando el guardado…', 'busy');

    try {
      const result = await window.electronAPI.saveRecording(state.recordingId, format);
      if (result.status === 'saved') {
        state.recordingId = null;
        state.phase = 'idle';
        setPhase('idle');
        elements.saveWebm.hidden = true;
        elements.saveProgress.hidden = true;
        elements.saveDescription.textContent = result.subtitlePath
          ? `Video y subtítulos guardados: ${result.path}`
          : `Guardado en ${result.path}`;
        setStatus(result.subtitlePath ? 'Video y subtítulos guardados' : `Guardado en ${result.path}`, 'ready');
        return;
      }
      state.phase = 'ready';
      setPhase('ready');
      elements.saveProgress.hidden = true;
      if (result.status === 'conversion-failed') {
        elements.saveTitle.textContent = 'La conversión no terminó';
        elements.saveDescription.textContent = `${result.message} La captura y la transcripción siguen disponibles para reintentar.`;
        elements.saveWebm.hidden = false;
        elements.saveWebm.textContent = 'Guardar original WebM con subtítulos';
        setStatus('Conversión fallida; el original está disponible');
      } else if (result.status === 'transcription-failed') {
        elements.saveTitle.textContent = 'No se pudo transcribir';
        elements.saveDescription.textContent = `${result.message} La captura permanece disponible. Corrige el problema y vuelve a guardar.`;
        elements.saveWebm.hidden = false;
        elements.saveWebm.textContent = 'Reintentar guardado WebM';
        setStatus('Transcripción pendiente');
      } else if (result.status === 'save-failed') {
        elements.saveTitle.textContent = 'No se pudo completar el guardado';
        elements.saveDescription.textContent = `${result.message} La captura original sigue disponible para reintentar.`;
        elements.saveWebm.hidden = true;
        setStatus('Error al guardar');
      } else {
        elements.saveTitle.textContent = 'Tu captura está lista';
        elements.saveDescription.textContent = 'Guardado cancelado. La captura sigue disponible.';
        elements.saveProgress.hidden = true;
        setStatus('Guardado cancelado');
      }
    } catch (error) {
      state.phase = 'ready';
      setPhase('ready');
      elements.saveProgress.hidden = true;
      elements.saveTitle.textContent = 'No se pudo guardar';
      elements.saveDescription.textContent = error.message;
      setStatus('Error al guardar');
    }
  }

  function cancelCountdown() {
    if (state.phase !== 'countdown') return;
    window.clearInterval(state.countdownTimer);
    state.countdownTimer = null;
    stopTracks();
    state.regionRect = null;
    elements.captureRegionBadge.hidden = true;
    updateRegionHighlight();
    state.phase = 'idle';
    setPhase('idle');
    setStatus('Cuenta atrás cancelada');
  }

  async function handleCaptureError(error) {
    let message = captureErrorMessage(error);
    if (state.captureStep === 'display') {
      try {
        const captureFailure = await window.electronAPI.getCaptureFailure();
        if (captureFailure) message = `${captureFailure} (${error?.name || 'error de captura'}${error?.message ? `: ${error.message}` : ''})`;
      } catch {}
    }
    stopTracks();
    if (state.recordingId) {
      try { await window.electronAPI.abortRecording(state.recordingId); } catch {}
    }
    state.recordingId = null;
    state.regionRect = null;
    elements.captureRegionBadge.hidden = true;
    updateRegionHighlight();
    state.phase = 'idle';
    setPhase('idle');
    const action = elements.captureMode.value === 'image' ? 'capturar la imagen' : 'iniciar la captura';
    setStatus(elements.captureMode.value === 'image' ? 'No se pudo generar la imagen' : 'No se pudo iniciar la captura');
    elements.sourceError.textContent = `No se pudo ${action}: ${message}`;
    elements.sourceError.hidden = false;
  }

  elements.refresh.addEventListener('click', loadSources);
  elements.captureMode.addEventListener('change', () => {
    setCaptureMode(elements.captureMode.value);
    setPhase(state.phase);
    syncCaptureOptions();
  });
  elements.compactCaptureMode.addEventListener('change', () => {
    setCaptureMode(elements.compactCaptureMode.value);
    setPhase(state.phase);
    syncCaptureOptions();
  });
  elements.regionCapture.addEventListener('change', () => {
    elements.compactRegionCapture.checked = elements.regionCapture.checked;
  });
  elements.compactRegionCapture.addEventListener('change', () => {
    elements.regionCapture.checked = elements.compactRegionCapture.checked;
  });
  elements.regionPreviewVideo.addEventListener('loadedmetadata', setRegionPreviewAspect);
  elements.regionPreviewVideo.addEventListener('pointerdown', (event) => {
    if (!elements.regionDialog.open) return;
    const bounds = elements.regionPreviewVideo.getBoundingClientRect();
    state.regionDragStart = {
      x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
      y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top))
    };
    elements.regionPreviewVideo.setPointerCapture(event.pointerId);
    updateRegionSelection(event);
  });
  elements.regionPreviewVideo.addEventListener('pointermove', updateRegionSelection);
  elements.regionPreviewVideo.addEventListener('pointerup', (event) => {
    updateRegionSelection(event);
    state.regionDragStart = null;
  });
  elements.confirmRegionSelection.addEventListener('click', () => finishRegionSelection(state.regionPendingRect));
  elements.cancelRegionSelection.addEventListener('click', () => finishRegionSelection(null));
  elements.regionDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    finishRegionSelection(null);
  });
  elements.chooseSaveDirectory.addEventListener('click', async () => {
    try {
      updateSaveDirectoryDisplay(await window.electronAPI.chooseSaveDirectory());
    } catch (error) {
      elements.saveDirectoryDisplay.textContent = `No se pudo guardar la carpeta: ${error.message}`;
    }
  });
  elements.resetSaveDirectory.addEventListener('click', async () => {
    try {
      updateSaveDirectoryDisplay(await window.electronAPI.resetSaveDirectory());
    } catch (error) {
      elements.saveDirectoryDisplay.textContent = `No se pudo restablecer: ${error.message}`;
    }
  });
  elements.compactToggle.addEventListener('click', () => {
    setCompactMode(elements.compactToggle.getAttribute('aria-pressed') !== 'true');
  });
  elements.compactExpand.addEventListener('click', () => setCompactMode(false));
  elements.compactSource.addEventListener('change', () => selectSource(elements.compactSource.value));
  elements.compactRefresh.addEventListener('click', loadSources);
  elements.compactSettings.addEventListener('toggle', () => {
    const expanded = elements.compactSettings.open;
    document.body.classList.toggle('compact-settings-expanded', expanded);
    const settingsPanel = elements.compactSettings.querySelector('.compact-settings-panel');
    const panelHeight = settingsPanel.scrollHeight;
    const requestedHeight = expanded
      ? Math.ceil(Math.max(settingsPanel.getBoundingClientRect().top + panelHeight + 16, panelHeight + 96))
      : undefined;
    window.electronAPI.setCompactSettingsOpen(expanded, requestedHeight).catch((error) => {
      setStatus(`No se pudieron abrir los ajustes: ${error.message}`);
    });
  });
  window.electronAPI.onCompactModeToggle(() => {
    setCompactMode(!document.body.classList.contains('compact-mode'));
  });
  elements.compactStart.addEventListener('click', () => elements.start.click());
  elements.compactCancelCountdown.addEventListener('click', () => elements.cancelCountdown.click());
  elements.compactStop.addEventListener('click', () => elements.stop.click());
  elements.compactSave.addEventListener('click', () => (elements.saveWebm.hidden ? elements.save : elements.saveWebm).click());
  elements.compactDiscard.addEventListener('click', () => elements.discard.click());
  elements.developerInfoButton.addEventListener('click', async () => {
    try {
      if (!state.developerInfo) state.developerInfo = await window.electronAPI.getDeveloperInfo();
      const info = state.developerInfo;
      elements.developerName.textContent = info.developer;
      elements.developerEmail.textContent = info.email;
      elements.developerVersion.textContent = info.version ? `v${info.version}` : '—';
      elements.developerDialog.showModal();
    } catch {
      elements.developerVersion.textContent = 'No disponible';
      elements.developerDialog.showModal();
    }
  });
  elements.closeDeveloperDialog.addEventListener('click', () => elements.developerDialog.close());
  elements.developerDialog.addEventListener('click', (event) => {
    if (event.target === elements.developerDialog) elements.developerDialog.close();
  });
  elements.start.addEventListener('click', startCountdownAndRecord);
  elements.cancelCountdown.addEventListener('click', cancelCountdown);
  elements.stop.addEventListener('click', stopRecording);
  document.querySelectorAll('[data-window-action]').forEach((button) => {
    button.addEventListener('click', () => {
      window.electronAPI.windowAction(button.dataset.windowAction).catch((error) => {
        setStatus(`No se pudo cambiar la ventana: ${error.message}`, 'busy');
      });
    });
  });
  elements.format.addEventListener('change', () => {
    elements.compactFormat.value = elements.format.value;
    elements.save.textContent = `Guardar ${elements.format.value.toUpperCase()}`;
  });
  elements.compactFormat.addEventListener('change', () => {
    elements.format.value = elements.compactFormat.value;
    elements.format.dispatchEvent(new Event('change'));
  });
  elements.videoSize.addEventListener('change', () => { elements.compactSize.value = elements.videoSize.value; });
  elements.compactSize.addEventListener('change', () => {
    elements.videoSize.value = elements.compactSize.value;
    elements.videoSize.dispatchEvent(new Event('change'));
  });
  elements.countdown.addEventListener('change', () => { elements.compactCountdown.value = elements.countdown.value; });
  elements.compactCountdown.addEventListener('change', () => {
    elements.countdown.value = elements.compactCountdown.value;
    elements.countdown.dispatchEvent(new Event('change'));
  });
  elements.microphone.addEventListener('change', () => {
    elements.compactMicrophone.checked = elements.microphone.checked;
    syncCaptureOptions();
  });
  elements.compactMicrophone.addEventListener('change', () => {
    elements.microphone.checked = elements.compactMicrophone.checked;
    elements.microphone.dispatchEvent(new Event('change'));
  });
  elements.systemAudio.addEventListener('change', () => {
    elements.compactSystemAudio.checked = elements.systemAudio.checked;
    syncCaptureOptions();
  });
  elements.compactSystemAudio.addEventListener('change', () => {
    elements.systemAudio.checked = elements.compactSystemAudio.checked;
    elements.systemAudio.dispatchEvent(new Event('change'));
  });
  elements.save.addEventListener('click', () => saveCurrentRecording(elements.format.value));
  elements.saveWebm.addEventListener('click', () => saveCurrentRecording('webm'));
  elements.discard.addEventListener('click', async () => {
    if (state.phase !== 'ready' || !state.recordingId || !window.confirm('¿Descartar la grabación sin guardar?')) return;
    try {
      await window.electronAPI.discardRecording(state.recordingId);
      state.recordingId = null;
      state.phase = 'idle';
      setPhase('idle');
      setStatus('Grabación descartada');
    } catch (error) {
      elements.saveDescription.textContent = error.message;
    }
  });

  setCaptureMode('video');
  elements.compactFormat.value = elements.format.value;
  elements.compactSize.value = elements.videoSize.value;
  elements.compactCountdown.value = elements.countdown.value;
  elements.compactMicrophone.checked = elements.microphone.checked;
  elements.compactSystemAudio.checked = elements.systemAudio.checked;
  initializeCompactMode();
  setPhase('idle');
  loadSaveDirectory();
  loadSources();
})();
