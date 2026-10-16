'use strict';

(() => {
  const list = document.getElementById('recovery-list');
  const count = document.getElementById('recovery-count');
  const status = document.getElementById('recovery-status');
  const progressBar = document.getElementById('recovery-progress');
  const error = document.getElementById('recovery-error');
  const empty = document.getElementById('recovery-empty');
  let sessions = [];
  let busyId = null;
  const cancel = document.getElementById('cancel-process');
  cancel.addEventListener('click', async () => {
    cancel.disabled = true;
    try { await window.recoveryAPI.cancel(); } catch (caught) { error.textContent = caught.message; error.hidden = false; }
  });

  const stateLabels = {
    recording: 'Captura interrumpida',
    'interrupted-recording': 'Captura interrumpida',
    ready: 'Lista para guardar',
    transcribing: 'Transcripción pendiente',
    converting: 'Conversión pendiente',
    finalizing: 'Guardado interrumpido',
    failed: 'Lista para reintentar',
    unrecoverable: 'No se pudo recuperar'
  };

  const failureMessages = {
    'capture-write-failed': 'La escritura se interrumpió. Se conservaron los fragmentos que llegaron al disco.',
    'source-missing': 'No se encontró el archivo original de esta sesión.',
    'source-invalid': 'El archivo parcial no se pudo validar como video.',
    'transcription-failed': 'La transcripción no terminó. Puedes intentarla otra vez desde el video original.',
    'conversion-failed': 'La conversión no terminó. Puedes reintentar desde el video original.',
    'finalization-failed': 'El guardado no terminó. El original sigue disponible para reintentar.'
  };

  function formatDate(value) {
    if (!value) return 'Fecha no disponible';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : date.toLocaleString();
  }

  function formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return 'Tamaño no disponible';
    const units = ['bytes', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
  }

  function makeButton(label, className, handler, disabled = false) {
    const button = document.createElement('button');
    button.className = `action-button ${className}`.trim();
    button.type = 'button';
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener('click', handler);
    return button;
  }

  function renderSessions() {
    cancel.hidden = busyId === null; cancel.disabled = false;
    list.replaceChildren();
    count.textContent = String(sessions.length);
    empty.hidden = sessions.length > 0;
    list.hidden = sessions.length === 0;
    if (!sessions.length) return;

    for (const session of sessions) {
      const card = document.createElement('article');
      card.className = 'session-card';
      const title = document.createElement('h2');
      title.className = 'session-name';
      title.textContent = session.sourceName || 'Grabación';
      const heading = document.createElement('div');
      heading.className = 'session-heading';
      heading.append(title);

      const state = document.createElement('span');
      let label = stateLabels[session.state] || 'Revisión necesaria';
      if (!session.mediaExists) label = 'Archivo no disponible';
      if (session.savedMediaPath) label = 'Video guardado; subtítulos pendientes';
      if (session.manifestInvalid) label = 'Registro dañado';
      state.className = 'session-state';
      if (session.state === 'ready' || session.state === 'failed') state.classList.add('is-ready');
      if (session.state === 'unrecoverable' || !session.mediaExists || session.manifestInvalid) state.classList.add('is-error');
      state.textContent = label;

      const meta = document.createElement('div');
      meta.className = 'session-meta';
      const date = document.createElement('span');
      date.textContent = formatDate(session.startedAt);
      const size = document.createElement('span');
      size.textContent = formatSize(session.mediaSize);
      meta.append(date, size);
      heading.append(meta);

      card.append(heading, state);
      if (session.savedMediaPath) {
        const savedPath = document.createElement('p');
        savedPath.className = 'session-meta';
        savedPath.textContent = `Video guardado: ${session.savedMediaPath}`;
        card.append(savedPath);
      }
      const reasonText = session.manifestInvalid
        ? 'El registro de esta sesión no es válido. Puedes quitarlo de la lista; el archivo asociado no se borrará porque no se pudo validar su ubicación.'
        : session.blockedByActiveRecording
          ? 'Termina o guarda la grabación actual en la ventana principal para continuar esta sesión.'
        : failureMessages[session.failureCode] || (!session.mediaExists
          ? 'El archivo ya no está disponible en la carpeta de recuperación.'
          : '');
      if (reasonText) {
        const reason = document.createElement('p');
        reason.className = 'session-error';
        reason.textContent = reasonText;
        card.append(reason);
      }

      const controls = document.createElement('div');
      controls.className = 'session-controls';
      const isBusy = busyId === session.id;
      const anyBusy = busyId !== null;
      const canContinue = !session.manifestInvalid
        && session.mediaExists
        && !session.blockedByActiveRecording
        && session.state !== 'unrecoverable';
      if (canContinue) {
        const format = document.createElement('select');
        format.className = 'format-select';
        format.setAttribute('aria-label', `Formato de salida para ${session.sourceName || 'la grabación'}`);
        for (const [value, labelText] of [['mp4', 'MP4'], ['mkv', 'MKV'], ['webm', 'WebM'], ['gif', 'GIF']]) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = labelText;
          format.append(option);
        }
        format.disabled = anyBusy;
        if (!session.savedMediaPath) controls.append(format);
        controls.append(makeButton(isBusy ? 'Procesando…' : session.savedMediaPath ? 'Reintentar subtítulos' : 'Continuar guardado', 'primary', async () => {
          busyId = session.id;
          status.textContent = 'Preparando la grabación…';
          status.hidden = false;
          error.hidden = true;
          renderSessions();
          try {
            const result = await window.recoveryAPI.continue(session.id, format.value);
            if (result.status === 'saved') {
              status.textContent = result.subtitlePath
                ? `Video y subtítulos guardados. Subtítulos: ${result.subtitlePath}`
                : result.subtitlesPending
                  ? `Video guardado en ${result.path}. Subtítulos pendientes: ${result.warning}`
                  : 'Video guardado correctamente.';
              if (result.warning && !result.subtitlesPending) status.textContent += ` ${result.warning}`;
              status.hidden = false;
              await refreshSessions();
            } else if (result.status === 'cancelled') {
              status.textContent = 'Proceso cancelado. El original se conserva para reintentar.';
              status.hidden = false;
              await refreshSessions();
            } else {
              error.textContent = result.message || 'No se pudo completar el guardado. El original se conserva para reintentar.';
              error.hidden = false;
              await refreshSessions();
            }
          } catch (caught) {
            error.textContent = caught.message || 'No se pudo continuar esta grabación.';
            error.hidden = false;
            await refreshSessions();
          } finally {
            progressBar.hidden = true;
            busyId = null;
            renderSessions();
          }
        }, anyBusy));
      }
      controls.append(makeButton(isBusy ? 'Espera…' : 'Descartar', 'danger', async () => {
        const prompt = `¿Descartar la grabación “${session.sourceName || 'Grabación'}”? Esta acción elimina su archivo de recuperación.`;
        if (!window.confirm(prompt)) return;
        busyId = session.id;
        renderSessions();
        error.hidden = true;
        try {
          await window.recoveryAPI.discard(session.id);
          status.textContent = 'Grabación descartada.';
          status.hidden = false;
          await refreshSessions();
        } catch (caught) {
          error.textContent = caught.message || 'No se pudo descartar esta grabación.';
          error.hidden = false;
        } finally {
          busyId = null;
          renderSessions();
        }
      }, anyBusy));
      card.append(controls);
      list.append(card);
    }
  }

  async function refreshSessions() {
    list.setAttribute('aria-busy', 'true');
    try {
      sessions = await window.recoveryAPI.list();
      error.hidden = true;
      renderSessions();
    } catch (caught) {
      sessions = [];
      renderSessions();
      error.textContent = caught.message || 'No se pudo leer la lista de recuperación.';
      error.hidden = false;
    } finally {
      list.setAttribute('aria-busy', 'false');
    }
  }

  const progressMessages = {
    'encoder-probe': 'Comprobando aceleración disponible…',
    'software-fallback': 'La aceleración falló; continuando con la conversión compatible…',
    'model-download': 'Descargando el modelo local de transcripción…',
    'audio-preparation': 'Preparando el audio para transcribir…',
    transcription: 'Transcribiendo en este equipo…',
    conversion: 'Preparando el formato de video…',
    finalizing: 'Guardando video y subtítulos…'
  };
  window.recoveryAPI.onSaveProgress((progress) => {
    const message = progressMessages[progress?.stage];
    if (!message) return;
    status.textContent = window.recorderSaveProgress.formatSaveProgress(progress, message);
    status.hidden = false;
    progressBar.hidden = false;
    if (Number.isFinite(progress.percent)) progressBar.value = progress.percent;
    else progressBar.removeAttribute('value');
  });
  window.recoveryAPI.onSessionsChanged(refreshSessions);
  document.addEventListener('keydown', (event) => {
    const shortcut = window.recorderKeyboard.findShortcut(event, { scope: 'recovery' });
    if (shortcut?.action === 'refresh-recovery') {
      event.preventDefault();
      if (busyId === null) refreshSessions();
    } else if (!event.repeat && !event.altKey && !event.shiftKey
      && ((event.key === 'Escape' && !event.ctrlKey && !event.metaKey) || (event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'w'))) {
      event.preventDefault();
      window.close();
    }
  });
  refreshSessions();
})();
