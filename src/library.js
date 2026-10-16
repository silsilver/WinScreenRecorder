'use strict';
(() => {
  const get = (id) => document.getElementById(id);
  const { formatSize, formatDuration, sortRecords } = window.recorderLibraryPresentation;
  function metadata(record) { return `${record.format || 'Captura'} · ${/\.(png|jpg|gif)$/i.test(record.path) ? 'Imagen' : formatDuration(record.durationMs)} · ${formatSize(record.sizeBytes)}`; }
  let records = [];
  let selected = null;
  let busy = false;
  let trimDuration = 0;
  let selectionTimer = null;
  function stopSelection() {
    if (selectionTimer !== null) { clearInterval(selectionTimer); selectionTimer = null; get('preview').pause(); }
    get('preview-trim').textContent = 'Reproducir fragmento';
  }
  function syncTrim(changed, fromRange = false) {
    stopSelection();
    let start = Number(get('start').value); let end = Number(get('end').value);
    if (fromRange) {
      if (changed === 'start') { start = Math.min(Number(get('range-start').value), Math.max(0, end - 0.1)); get('start').value = start.toFixed(2); }
      else { end = Math.max(Number(get('range-end').value), start + 0.1); get('end').value = Math.min(trimDuration, end).toFixed(2); }
    }
    const valid = Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end - start >= 0.0999 && (!trimDuration || end <= trimDuration + 0.01);
    get('end').setCustomValidity(valid ? '' : 'El final debe superar al inicio al menos 0.1 segundos y estar dentro del video.');
    for (const [id, value] of [['range-start', start], ['range-end', end]]) get(id).value = String(value);
    get('trim-summary').textContent = valid ? `Fragmento: ${start.toFixed(2)}–${end.toFixed(2)} s · Duración: ${(end - start).toFixed(2)} s` : 'Ajusta el inicio y el final dentro de la duración del video.';
    get('preview-trim').disabled = busy || !valid || !Number.isFinite(get('preview').duration);
  }
  function setTrimDuration(seconds) {
    trimDuration = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds * 100) / 100 : 0;
    for (const id of ['range-start', 'range-end']) { get(id).max = String(trimDuration); get(id).disabled = !trimDuration || busy; }
    syncTrim();
  }
  function report(error) { get('error').textContent = error.message || String(error); get('error').hidden = false; }
  async function run(operation, cancellable = false) {
    if (busy) return;
    busy = true; get('error').hidden = true;
    stopSelection();
    document.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    get('cancel-process').hidden = !cancellable; get('cancel-process').disabled = false;
    try { await operation(); } catch (error) { report(error); }
    finally { busy = false; get('progress').hidden = true; get('cancel-process').hidden = true; document.querySelectorAll('button').forEach((button) => { button.disabled = false; }); render(); }
  }
  function select(record) {
    selected = record.id;
    get('detail').hidden = false; get('name').textContent = record.name; get('path').textContent = record.path;
    get('capture-name').value = record.name; get('metadata').textContent = metadata(record);
    const image = /\.(png|jpg|gif)$/i.test(record.path);
    clearPreview();
    get('preview').hidden = image || !record.available; get('image-preview').hidden = !image || !record.available;
    if (record.available) get(image ? 'image-preview' : 'preview').src = record.previewUrl;
    get('media-hint').textContent = record.available ? 'El original se conserva. La vista previa no modifica el archivo.' : 'El archivo se movió o ya no está disponible.';
    get('open').disabled = !record.available || busy; get('folder').disabled = !record.available || busy;
    get('trim-form').hidden = image || !record.available;
    get('start').value = '0'; get('end').value = record.durationMs ? (record.durationMs / 1000).toFixed(2) : '';
    setTrimDuration(record.durationMs / 1000);
    render();
  }
  function clearPreview() {
    stopSelection();
    get('preview').pause(); get('preview').removeAttribute('src'); get('preview').load();
    get('image-preview').removeAttribute('src');
  }
  function render() {
    const term = get('search').value.toLocaleLowerCase();
    const filtered = sortRecords(records.filter((item) => `${item.name} ${item.path}`.toLocaleLowerCase().includes(term)), get('sort').value);
    get('captures').replaceChildren(); get('empty').hidden = filtered.length > 0;
    get('empty').textContent = records.length ? 'No hay coincidencias con la búsqueda.' : 'No hay capturas. Guarda una nueva o agrega un archivo existente.';
    for (const record of filtered) {
      const button = document.createElement('button'); button.className = 'capture'; button.type = 'button'; button.disabled = busy;
      button.setAttribute('aria-pressed', String(record.id === selected)); button.textContent = record.name;
      const info = document.createElement('small'); info.textContent = `${new Date(record.savedAt).toLocaleString()} · ${metadata(record)}${record.available ? '' : ' · No disponible'}`;
      button.append(info); button.addEventListener('click', () => select(record)); get('captures').append(button);
    }
    const record = records.find((item) => item.id === selected);
    if (record) { get('open').disabled = busy || !record.available; get('folder').disabled = busy || !record.available; }
    for (const id of ['range-start', 'range-end']) get(id).disabled = busy || !trimDuration;
    get('preview-trim').disabled = busy || !get('end').checkValidity() || !Number.isFinite(get('preview').duration);
  }
  async function refresh() {
    const previous = records.find((item) => item.id === selected);
    records = await window.libraryAPI.list();
    try { const info = await window.libraryAPI.encoderStatus(); get('encoder-status').textContent = `Conversión: ${info.label}.`; } catch {}
    if (selected && !records.some((item) => item.id === selected)) { selected = null; get('detail').hidden = true; clearPreview(); }
    const current = records.find((item) => item.id === selected);
    if (current && previous && (current.available !== previous.available || current.previewUrl !== previous.previewUrl)) select(current);
    render();
    if (!selected && records[0]) select(records[0]);
  }
  async function loadShortcuts() {
    const shortcuts = (await window.libraryAPI.shortcuts()).filter((item) => item.scope === 'global');
    get('shortcut-fields').replaceChildren();
    for (const shortcut of shortcuts) {
      const label = document.createElement('label'); label.textContent = `${shortcut.label}${shortcut.registered ? '' : ' · ocupado'}`;
      const input = document.createElement('input'); input.value = shortcut.binding; input.dataset.action = shortcut.action; input.maxLength = 60; input.required = true;
      label.append(input); get('shortcut-fields').append(label);
    }
  }
  get('search').addEventListener('input', render);
  try { const order = localStorage.getItem('winscreen-library-sort-v1'); if (['newest', 'oldest', 'name', 'size', 'duration'].includes(order)) get('sort').value = order; } catch {}
  get('sort').addEventListener('change', () => { try { localStorage.setItem('winscreen-library-sort-v1', get('sort').value); } catch {} render(); });
  get('rename-form').addEventListener('submit', (event) => { event.preventDefault(); void run(async () => {
    const updated = await window.libraryAPI.rename(selected, get('capture-name').value);
    await refresh(); get('name').textContent = updated.name; get('capture-name').value = updated.name;
    get('notice').textContent = 'Nombre actualizado. El archivo conserva su ubicación.';
  }); });
  get('refresh').addEventListener('click', () => run(refresh));
  get('import').addEventListener('click', () => run(async () => { const item = await window.libraryAPI.importCapture(); if (item?.id) { await refresh(); select(records.find((record) => record.id === item.id)); } }, true));
  get('cancel-process').addEventListener('click', async () => {
    get('cancel-process').disabled = true;
    try { await window.libraryAPI.cancel(); } catch (error) { report(error); }
  });
  get('open').addEventListener('click', () => run(() => window.libraryAPI.open(selected)));
  get('folder').addEventListener('click', () => run(() => window.libraryAPI.open(selected, true)));
  get('forget').addEventListener('click', () => run(async () => { if (!confirm('¿Quitar del historial? El archivo y sus subtítulos no se borrarán.')) return; await window.libraryAPI.forget(selected); await refresh(); }));
  get('preview').addEventListener('loadedmetadata', () => {
    if (Number.isFinite(get('preview').duration)) {
      if (!get('end').value || Number(get('end').value) > get('preview').duration) get('end').value = (Math.floor(get('preview').duration * 100) / 100).toFixed(2);
      setTrimDuration(get('preview').duration);
    }
  });
  get('preview').addEventListener('error', () => { get('media-hint').textContent = 'La vista previa no pudo reproducirse. Puedes abrir el archivo con tu reproductor o crear el recorte con FFmpeg.'; });
  get('mark-start').addEventListener('click', () => { get('start').value = get('preview').currentTime.toFixed(2); syncTrim(); });
  get('mark-end').addEventListener('click', () => { get('end').value = get('preview').currentTime.toFixed(2); syncTrim(); });
  for (const field of ['start', 'end']) {
    get(field).addEventListener('input', () => syncTrim(field));
    get(`range-${field}`).addEventListener('input', () => syncTrim(field, true));
  }
  get('preview').addEventListener('pause', stopSelection);
  get('preview-trim').addEventListener('click', () => {
    if (selectionTimer !== null) { stopSelection(); return; }
    const player = get('preview'); const end = Number(get('end').value);
    if (!get('trim-form').checkValidity() || !Number.isFinite(player.duration)) return;
    player.currentTime = Number(get('start').value);
    get('preview-trim').textContent = 'Detener vista previa';
    selectionTimer = setInterval(() => {
      if (player.ended || player.currentTime >= end) { stopSelection(); player.currentTime = end; }
    }, 30);
    player.play().catch((error) => { stopSelection(); report(error); });
  });
  window.addEventListener('beforeunload', stopSelection);
  get('trim-form').addEventListener('submit', (event) => { event.preventDefault(); void run(async () => {
    const result = await window.libraryAPI.trim(selected, Number(get('start').value), Number(get('end').value));
    if (result.status === 'cancelled') { get('notice').textContent = 'Recorte cancelado. El original se conserva.'; return; }
    get('notice').textContent = `Recorte guardado: ${result.path}${result.warning ? '. ' + result.warning : ''}`;
    await refresh();
  }, true); });
  get('shortcuts-form').addEventListener('submit', (event) => { event.preventDefault(); void run(async () => {
    const values = {}; get('shortcut-fields').querySelectorAll('input').forEach((input) => { values[input.dataset.action] = input.value; });
    await window.libraryAPI.saveShortcuts(values); await loadShortcuts(); get('notice').textContent = 'Atajos actualizados.';
  }); });
  get('reset-shortcuts').addEventListener('click', () => run(async () => { await window.libraryAPI.saveShortcuts({}); await loadShortcuts(); get('notice').textContent = 'Atajos predeterminados restaurados.'; }));
  window.libraryAPI.onChanged(() => { if (!busy) void refresh().catch(report); });
  window.libraryAPI.onProgress((progress) => {
    const message = progress.stage === 'encoder-probe' ? 'Comprobando aceleración…' : progress.stage === 'software-fallback' ? 'Continuando con conversión compatible…' : 'Creando recorte…';
    get('notice').textContent = window.recorderSaveProgress.formatSaveProgress(progress, message); get('progress').hidden = false;
    if (Number.isFinite(progress.percent)) get('progress').value = progress.percent; else get('progress').removeAttribute('value');
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !busy) window.close(); });
  void run(async () => { await refresh(); await loadShortcuts(); });
})();
