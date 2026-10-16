'use strict';
const { app, BrowserWindow, dialog, globalShortcut, powerMonitor } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const stage = process.argv.find((value) => value.startsWith('--stage='))?.slice(8) || 'full';
const quick = process.argv.includes('--quick');
const spawnedConversions = [];
let throttleConversion = stage === 'cancel' || stage === 'quit';
if (stage === 'cancel' || stage === 'quit') {
  const children = require('node:child_process');
  const originalSpawn = children.spawn;
  children.spawn = function (executable, args, options) {
    if (throttleConversion && /ffmpeg\.exe$/i.test(executable) && args.includes('-progress')) {
      args = [...args]; args.splice(args.indexOf('-i'), 0, '-re');
    }
    const child = originalSpawn.call(this, executable, args, options);
    if (/ffmpeg\.exe$/i.test(executable) && args.includes('-progress')) {
      const item = { pid: child.pid, closed: false }; spawnedConversions.push(item); child.once('close', () => { item.closed = true; });
    }
    return child;
  };
}
const output = path.join(root, 'dist', 'verification', stage === 'full' ? 'functional-app' : `stage-${stage === 'recovery' ? 'stability' : stage}`);
fsSync.mkdirSync(path.join(output, 'Videos'), { recursive: true });
fsSync.mkdirSync(path.join(output, 'profile'), { recursive: true });
app.setPath('userData', path.join(output, 'profile'));
app.setPath('videos', path.join(output, 'Videos'));
app.setAppPath(root);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.on('window-all-closed', () => {});
const keepOpen = process.argv.includes('--keep-open');
const trace = (message) => fsSync.appendFileSync(path.join(output, 'trace.log'), `${new Date().toISOString()} ${message}\n`);
fsSync.writeFileSync(path.join(output, 'trace.log'), '');
fsSync.rmSync(path.join(output, 'failure.log'), { force: true });
fsSync.rmSync(path.join(output, 'result.json'), { force: true });
require('../main.js');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    let timer;
    try {
      const matched = await Promise.race([Promise.resolve().then(check), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Tiempo agotado: ${label}`)), Math.max(1, timeout - (Date.now() - started)));
      })]);
      if (matched) return;
    } finally { clearTimeout(timer); }
    await pause(100);
  }
  throw new Error(`Tiempo agotado: ${label}`);
}
const assert = (condition, message) => { if (!condition) throw new Error(message); };

app.whenReady().then(async () => {
  const errors = [];
  app.on('web-contents-created', (_event, contents) => {
    contents.on('render-process-gone', (_event, detail) => errors.push(`renderer: ${detail.reason}`));
  });
  trace('Programa real iniciado');
  let main;
  await until(() => {
    main = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes('/src/index.html'));
    return main && !main.webContents.isLoading();
  }, 'ventana principal');
  const evaluate = (code) => main.webContents.executeJavaScript(code, true);
  if (stage === 'recovery') {
    const sessions = await evaluate('window.electronAPI.getRecoverySessions()');
    assert(sessions.length > 0, 'No se conservó la captura interrumpida');
    await evaluate('window.electronAPI.openRecoveryWindow()');
    let recovery;
    await until(() => { recovery = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes('/src/recovery.html')); return recovery && !recovery.webContents.isLoading(); }, 'Recuperación tras reinicio');
    const result = await recovery.webContents.executeJavaScript(`window.recoveryAPI.continue(${JSON.stringify(sessions[0].id)},'mp4')`, true);
    assert(result.status === 'saved' && (await fs.stat(result.path)).size > 0, 'No se recuperó la captura');
    const { execFileSync } = require('node:child_process');
    execFileSync(path.join(root, 'vendor/ffmpeg/ffmpeg.exe'), ['-v', 'error', '-i', result.path, '-f', 'null', '-'], { windowsHide: true });
    await fs.writeFile(path.join(output, 'recovery-result.json'), JSON.stringify({ abruptRestartRecovery: true, decoded: true, path: result.path }, null, 2));
    trace('Recuperación tras salida abrupta y decodificación aprobadas');
    app.quit(); return;
  }
  const fixtureTitle = 'WSR Functional Test ' + stage;
  const fixture = new BrowserWindow({ width: 440, height: 300, x: 20, y: 20, show: true, title: fixtureTitle, webPreferences: { backgroundThrottling: false } });
  await fixture.loadURL('data:text/html,' + encodeURIComponent('<meta charset=utf-8><title>' + fixtureTitle + '</title><body style="margin:0;background:#263a5b;color:white;font:24px sans-serif"><canvas width="420" height="240"></canvas><script>const c=document.querySelector("canvas").getContext("2d");let i=0;setInterval(()=>{c.fillStyle=i++%2?"#263a5b":"#334477";c.fillRect(0,0,420,240);c.fillStyle="white";c.fillText("Prueba de grabación "+i,20,120)},100)</script>'));
  await pause(1000);
  trace(`Ventana de prueba: ${fixture.getTitle()}, visible=${fixture.isVisible()}`);
  await evaluate("document.getElementById('refresh-sources').click()");
  let source;
  let sourceCount = null;
  await until(async () => { const sources = await evaluate('window.electronAPI.getSources()'); if (sourceCount !== sources.length) { sourceCount = sources.length; trace(`Fuentes disponibles: ${sourceCount}`); } source = sources.find((item) => item.name.includes(fixtureTitle)); return source; }, 'ventana de prueba como fuente');
  await evaluate(`document.getElementById('compact-source-select').value=${JSON.stringify(source.id)};document.getElementById('compact-source-select').dispatchEvent(new Event('change'));`);
  await until(() => evaluate("!document.getElementById('start-recording').disabled"), 'fuente lista');
  await evaluate(`
    const get=id=>document.getElementById(id);
    if(get('system-audio-toggle').checked)get('system-audio-toggle').click();
    get('quality-profile').value='light';get('quality-profile').dispatchEvent(new Event('change'));
    get('countdown-select').value='0';get('recording-limit').value='0';get('recording-limit').dispatchEvent(new Event('change'));
  `);
  await until(() => evaluate("!document.getElementById('start-recording').disabled"), 'configuración');
  if (stage === 'devices') {
    await evaluate(`(() => {
      window.__physicalStreams = [];
      const request = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async (options) => { const stream = await request(options); window.__physicalStreams.push(stream); return stream; } });
      if(!document.getElementById('microphone-toggle').checked)document.getElementById('microphone-toggle').click();
    })()`);
    await until(() => evaluate("!document.getElementById('test-microphone').disabled"), 'prueba de micrófono habilitada');
    await evaluate("document.getElementById('test-microphone').click()");
    await until(() => evaluate("document.getElementById('test-microphone').textContent==='Finalizar prueba' || document.getElementById('microphone-test-status').textContent.includes('No se pudo')"), 'respuesta del dispositivo físico');
    const opened = await evaluate("document.getElementById('test-microphone').textContent==='Finalizar prueba'");
    await pause(700);
    const message = await evaluate("document.getElementById('microphone-test-status').textContent");
    if (opened) await evaluate("document.getElementById('test-microphone').click()");
    const released = await evaluate("window.__physicalStreams.every(stream=>stream.getTracks().every(track=>track.readyState==='ended'))");
    assert(released, 'No liberó el micrófono');
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ physicalMicrophoneOpened: opened, released, audioSaved: false, message }, null, 2));
    trace(`Prueba física de micrófono: ${opened ? 'apertura y liberación correctas' : message}`);
    fixture.destroy(); app.quit(); return;
  }
  await evaluate("document.getElementById('start-recording').click()");
  await until(() => evaluate("!document.getElementById('recording-actions').hidden"), 'captura real de ventana');
  trace('Captura real iniciada');
  if (stage === 'crash') {
    await pause(2500);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No recargó la interfaz')), 30000);
      main.webContents.once('did-finish-load', () => { clearTimeout(timer); resolve(); });
      main.webContents.forcefullyCrashRenderer();
    });
    await until(() => evaluate('window.electronAPI.getRecoverySessions().then(items=>items.some(item=>item.mediaSize>0))').catch(() => false), 'recarga y recuperación tras fallo de interfaz', 30000);
    const sessions = await evaluate('window.electronAPI.getRecoverySessions()');
    await evaluate('window.electronAPI.openRecoveryWindow()');
    let recovery;
    await until(() => { recovery = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes('/src/recovery.html')); return recovery && !recovery.webContents.isLoading(); }, 'recuperación tras fallo de interfaz');
    const pending = sessions.find((item) => item.mediaSize > 0);
    const saved = await recovery.webContents.executeJavaScript(`window.recoveryAPI.continue(${JSON.stringify(pending.id)},'mp4')`, true);
    assert(saved.status === 'saved', 'No recuperó tras fallo de interfaz');
    require('node:child_process').execFileSync(path.join(root, 'vendor/ffmpeg/ffmpeg.exe'), ['-v', 'error', '-i', saved.path, '-f', 'null', '-'], { windowsHide: true });
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ expectedRendererCrash: true, interfaceReloaded: true, recoverySavedAndDecoded: true, path: saved.path }, null, 2));
    trace('Interfaz recargada y video recuperado tras fallo real del renderer');
    app.quit(); return;
  }
  if (stage === 'stability') {
    const memoryBefore = app.getAppMetrics().find((item) => item.pid === main.webContents.getOSProcessId())?.memory;
    for (let minute = 1; minute <= 3; minute++) { await pause(60000); trace(`Captura prolongada: ${minute} minutos reales`); }
    const memoryAfter = app.getAppMetrics().find((item) => item.pid === main.webContents.getOSProcessId())?.memory;
    powerMonitor.emit('suspend');
    await until(() => evaluate("!document.getElementById('idle-actions').hidden && document.getElementById('status-text').textContent.includes('Guardado')"), 'guardado por suspensión simulada', 30000);
    assert(await evaluate("document.getElementById('capture-alert').textContent.includes('suspenderse')"), 'No informó suspensión');
    trace('Finalización por suspensión simulada correcta');
    await evaluate(`document.getElementById('compact-source-select').value=${JSON.stringify(source.id)};document.getElementById('compact-source-select').dispatchEvent(new Event('change'));`);
    await until(() => evaluate("!document.getElementById('start-recording').disabled"), 'captura para interrupción');
    await evaluate("document.getElementById('start-recording').click()");
    await until(() => evaluate("!document.getElementById('recording-actions').hidden"), 'captura interrumpible');
    await pause(10000);
    await fs.writeFile(path.join(output, 'stability-result.json'), JSON.stringify({ realMinutes: 3, simulatedSuspendSaved: true, memoryBefore, memoryAfter, abruptExitPrepared: true }, null, 2));
    trace('Salida abrupta preparada con fragmentos reales');
    app.exit(0); return;
  }
  await pause(700);
  await evaluate("document.getElementById('pause-recording').click()");
  assert(await evaluate("document.getElementById('pause-recording').getAttribute('aria-pressed')==='true'"), 'No pausó');
  await pause(300); await evaluate("document.getElementById('pause-recording').click()");
  await pause(900); await evaluate("document.getElementById('stop-recording').click()");
  if (stage === 'quit') {
    await until(() => spawnedConversions.some((item) => !item.closed), 'conversión real para cerrar');
    await pause(250);
    const count = spawnedConversions.length;
    app.once('will-quit', () => {
      const partials = fsSync.readdirSync(path.join(output, 'Videos/WinScreenRecorder')).filter((name) => name.endsWith('.partial.mp4'));
      const report = { noRelaunch: spawnedConversions.length === count, allConvertersClosed: spawnedConversions.every((item) => item.closed), temporaryOutputs: partials };
      fsSync.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
    });
    app.quit(); return;
  }
  if (stage === 'cancel') {
    await until(() => evaluate("!document.getElementById('cancel-process').hidden"), 'cancelación disponible');
    await pause(250);
    await evaluate("document.getElementById('cancel-process').click()");
    await until(() => evaluate("!document.getElementById('save-actions').hidden && !document.getElementById('save-recording').disabled"), 'guardado cancelado y reintentable');
    const partials = await fs.readdir(path.join(output, 'Videos/WinScreenRecorder/Recuperación'));
    assert(partials.some((item) => item.endsWith('.partial.webm')), 'Cancelar eliminó el original');
    throttleConversion = false;
    await evaluate("document.getElementById('save-recording').click()");
    trace('Cancelación del guardado y conservación del original correctas');
  }
  await until(() => evaluate("!document.getElementById('idle-actions').hidden && document.getElementById('status-text').textContent.includes('Guardado')"), 'guardado real', 30000);
  await evaluate('window.electronAPI.openLibrary()');
  let library;
  await until(() => { library = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes('/src/library.html')); return library && !library.webContents.isLoading(); }, 'Biblioteca');
  const libraryEval = (code) => library.webContents.executeJavaScript(code, true);
  let history = await libraryEval('window.libraryAPI.list()');
  assert(history.length > 0 && history[0].available, 'No se registró el guardado');
  const original = history[0];
  assert(await libraryEval("(() => { document.getElementById('start').value='0.12';document.getElementById('end').value='0.78';return document.getElementById('trim-form').checkValidity(); })()"), 'El formulario rechaza las centésimas');
  assert((await fs.stat(original.path)).size > 0, 'Video vacío');
  trace(`Guardado y registrado: ${path.basename(original.path)}`);
  if (stage === 'timeline' || stage === 'library' || stage === 'acceleration') {
    await until(() => libraryEval("document.getElementById('preview').readyState >= 1"), 'metadatos de vista previa');
    await libraryEval("document.getElementById('range-start').value='0.2';document.getElementById('range-start').dispatchEvent(new Event('input'));document.getElementById('range-end').value='0.8';document.getElementById('range-end').dispatchEvent(new Event('input'))");
    assert(await libraryEval("document.getElementById('start').value==='0.20' && document.getElementById('end').value==='0.80'"), 'Los rangos no sincronizan tiempos');
    await until(() => libraryEval("!document.getElementById('range-start').disabled"), 'rango habilitado');
    await libraryEval("document.getElementById('range-start').focus()");
    library.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' });
    library.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' });
    await until(() => libraryEval("document.getElementById('start').value==='0.21'"), 'rango accesible por teclado');
    await libraryEval("document.getElementById('range-start').value='0.2';document.getElementById('range-start').dispatchEvent(new Event('input'))");
    await libraryEval("document.getElementById('preview-trim').click()");
    await until(() => libraryEval("document.getElementById('preview').paused && document.getElementById('preview').currentTime >= 0.79"), 'vista previa limitada al fragmento');
    assert(await libraryEval("document.getElementById('preview').currentTime <= 0.85"), 'La vista previa excedió el recorte');
    await libraryEval("document.getElementById('trim-summary').scrollIntoView({block:'center'})");
    await fs.writeFile(path.join(output, 'timeline.png'), (await library.webContents.capturePage()).toPNG());
    trace('Línea de tiempo y reproducción limitada correctas');
  }
  if (stage === 'library' || stage === 'acceleration') {
    assert(original.sizeBytes > 0 && original.format === 'MP4' && original.durationMs > 0, 'Metadatos incompletos');
    await libraryEval("document.getElementById('capture-name').value='Sesión de prueba organizada';document.getElementById('rename-form').requestSubmit()");
    await until(() => libraryEval("document.getElementById('name').textContent==='Sesión de prueba organizada'"), 'nombre descriptivo');
    await libraryEval("document.getElementById('sort').value='name';document.getElementById('sort').dispatchEvent(new Event('change'))");
    await new Promise((resolve) => { library.webContents.once('did-finish-load', resolve); library.webContents.reload(); });
    await until(() => libraryEval("document.getElementById('capture-name').value==='Sesión de prueba organizada'"), 'persistencia de nombre');
    assert(await libraryEval("document.getElementById('sort').value==='name'"), 'No conservó orden');
    assert((await fs.stat(original.path)).size > 0, 'El nombre cambió el archivo original');
    await libraryEval("document.getElementById('search').value='nombre inexistente 99233';document.getElementById('search').dispatchEvent(new Event('input'))");
    assert(await libraryEval("!document.getElementById('empty').hidden && document.getElementById('empty').textContent.includes('coincidencias')"), 'No hay estado de búsqueda vacía');
    await libraryEval("document.getElementById('search').value='';document.getElementById('search').dispatchEvent(new Event('input'))");
    trace('Metadatos, nombre persistido, orden y búsqueda vacía correctos');
    const moved = `${original.path}.moved`;
    await fs.rename(original.path, moved);
    try {
      await libraryEval("document.getElementById('refresh').click()");
      await until(() => libraryEval("document.getElementById('trim-form').hidden && document.getElementById('media-hint').textContent.includes('ya no está disponible')"), 'archivo movido detectado');
    } finally { await fs.rename(moved, original.path); }
    await libraryEval("document.getElementById('refresh').click()");
    await until(() => libraryEval("!document.getElementById('trim-form').hidden && !document.getElementById('refresh').disabled"), 'archivo restaurado detectado');
    trace('Biblioteca actualiza la selección al mover y restaurar el archivo');
  }

  const srt = original.path.replace(/\.[^.]+$/, '.srt');
  await fs.writeFile(srt, '1\n00:00:00,000 --> 00:00:01,500\nSubtítulo de prueba\n');
  const originalDialog = dialog.showOpenDialog;
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [original.path] });
  try { await libraryEval('window.libraryAPI.importCapture()'); } finally { dialog.showOpenDialog = originalDialog; }
  const before = await fs.readFile(original.path);
  if (stage === 'cancel') {
    throttleConversion = true;
    await libraryEval(`document.getElementById('start').value='0';document.getElementById('end').value=${JSON.stringify((original.durationMs / 1000).toFixed(2))};document.getElementById('trim').click()`);
    await until(() => libraryEval("!document.getElementById('cancel-process').hidden"), 'cancelación de recorte disponible');
    await pause(250);
    await libraryEval("document.getElementById('cancel-process').click()");
    await until(() => libraryEval("document.getElementById('notice').textContent.includes('Recorte cancelado') && document.getElementById('cancel-process').hidden"), 'recorte cancelado');
    assert((await fs.readFile(original.path)).equals(before), 'Cancelar recorte alteró el original');
    assert(!(await fs.readdir(path.dirname(original.path))).some((name) => name.endsWith('.partial.mp4')), 'Temporal de recorte abandonado');
    throttleConversion = false;
    trace('Cancelación de recorte FFmpeg real y limpieza correctas');
  }
  const clip = await libraryEval(`window.libraryAPI.trim(${JSON.stringify(original.id)},0.2,0.8)`);
  assert((await fs.stat(clip.path)).size > 0 && clip.subtitlePath, 'Recorte o subtítulos no guardados');
  assert((await fs.readFile(original.path)).equals(before), 'El recorte modificó el original');
  assert((await fs.readFile(clip.subtitlePath, 'utf8')).includes('00:00:00,000 --> 00:00:00,600'), 'SRT del recorte desajustado');
  trace('Recorte y SRT real correctos');
  let encoderStatus = null;
  if (stage === 'acceleration') {
    encoderStatus = await evaluate('window.electronAPI.getEncoderStatus()');
    assert(encoderStatus.checked && encoderStatus.encoder, 'No se comprobó la aceleración');
    const { createEncoderPolicy } = require('../src/video-encoder');
    const { execFile } = require('node:child_process');
    const { promisify } = require('node:util');
    const execute = promisify(execFile);
    const fallback = path.join(output, 'hardware-failure-fallback.mp4');
    const controlled = createEncoderPolicy({ probe: async () => true });
    await controlled.encode(async (encoder) => execute(path.join(root, 'vendor/ffmpeg/ffmpeg.exe'), [
      '-nostdin', '-v', 'error', '-y', '-i', original.path, '-t', '0.5', '-c:v', encoder === 'libopenh264' ? encoder : 'invalid_wsr_encoder', fallback
    ], { windowsHide: true }));
    assert(controlled.status().encoder === 'libopenh264', 'No usó la alternativa tras fallo');
    await execute(path.join(root, 'vendor/ffmpeg/ffmpeg.exe'), ['-v', 'error', '-i', fallback, '-f', 'null', '-'], { windowsHide: true });
    trace(`Sondeo real: ${encoderStatus.label}; alternativa tras fallo controlado decodificada`);
  }

  const globals = (await libraryEval('window.libraryAPI.shortcuts()')).filter((item) => item.scope === 'global');
  const settings = Object.fromEntries(globals.map((item, index) => [item.action, `Ctrl+Alt+Shift+F${index + 13}`]));
  await libraryEval(`window.libraryAPI.saveShortcuts(${JSON.stringify(settings)})`);
  assert((await libraryEval('window.libraryAPI.shortcuts()')).filter((item) => item.scope === 'global').every((item) => item.registered), 'Atajos nuevos no registrados');
  if (globalShortcut.register('CommandOrControl+Alt+Shift+F18', () => {})) {
    let rejected = false;
    try { await libraryEval(`window.libraryAPI.saveShortcuts(${JSON.stringify({ ...settings, 'capture-pause': 'Ctrl+Alt+Shift+F18' })})`); }
    catch { rejected = true; }
    globalShortcut.unregister('CommandOrControl+Alt+Shift+F18');
    assert(rejected, 'No rechazó un conflicto de atajos');
    assert((await libraryEval('window.libraryAPI.shortcuts()')).find((item) => item.action === 'capture-pause').binding.replace(/\s/g, '') === settings['capture-pause'], 'El conflicto cambió el atajo anterior');
    assert((await libraryEval('window.libraryAPI.shortcuts()')).filter((item) => item.scope === 'global').every((item) => item.registered), 'No restauró los atajos');
  } else throw new Error('No se pudo preparar el conflicto de atajos');
  trace('Atajos aplicados y conflicto verificado');
  await libraryEval(`window.libraryAPI.forget(${JSON.stringify(original.id)})`);
  assert((await fs.stat(original.path)).size > 0, 'Quitar historial eliminó el archivo');

  // One real minute verifies the timer without falsifying the wall clock or recorder.
  await evaluate("document.getElementById('refresh-sources').click()"); await pause(700);
  await evaluate(`document.getElementById('compact-source-select').value=${JSON.stringify(source.id)};document.getElementById('compact-source-select').dispatchEvent(new Event('change'));`);
  await until(() => evaluate("!document.getElementById('start-recording').disabled"), 'segunda fuente');
  if (!quick) {
  await evaluate("document.getElementById('recording-limit').value='1';document.getElementById('recording-limit').dispatchEvent(new Event('change'));document.getElementById('start-recording').click()");
  await until(() => evaluate("!document.getElementById('recording-actions').hidden"), 'temporizador iniciado');
  trace('Prueba de temporizador de un minuto en curso');
  await until(() => evaluate("!document.getElementById('idle-actions').hidden && document.getElementById('capture-alert').textContent.includes('tiempo programado')"), 'detención programada real', 90000);
  trace('Temporizador real y guardado correctos');
  }

  await evaluate(`document.getElementById('compact-source-select').value=${JSON.stringify(source.id)};document.getElementById('compact-source-select').dispatchEvent(new Event('change'));`);
  await until(() => evaluate("!document.getElementById('start-recording').disabled"), 'fuente para desconexión');
  await evaluate("document.getElementById('recording-limit').value='0';document.getElementById('recording-limit').dispatchEvent(new Event('change'));document.getElementById('start-recording').click()");
  await until(() => evaluate("!document.getElementById('recording-actions').hidden"), 'captura para desconexión');
  await pause(1200);
  fixture.destroy();
  await until(() => evaluate("!document.getElementById('idle-actions').hidden && document.getElementById('capture-alert').textContent.includes('desconectó')"), 'desconexión de ventana y guardado', 30000);
  trace('Desconexión de ventana real: aviso y guardado correctos');

  await libraryEval("document.getElementById('refresh').click()"); await pause(300);
  const entries = await libraryEval('window.libraryAPI.list()');
  const report = { realWindowCapture: true, pauseResume: true, savedHistory: true, clipPath: clip.path,
    subtitleClip: true, originalPreserved: true, customShortcuts: true, conflictRollback: true, realMinuteTimer: !quick,
    realSourceDisconnection: true, encoderStatus, historyEntries: entries.length, isolatedProfile: path.join(output, 'profile'), errors };
  if (errors.length) throw new Error(errors.join('\n'));
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(output, 'library.png'), (await library.webContents.capturePage()).toPNG());
  trace('Verificación completa aprobada'); console.log(JSON.stringify(report));
  if (!fixture.isDestroyed()) fixture.destroy();
  if (!keepOpen) app.quit();
}).catch((error) => { trace(error.stack || String(error)); fsSync.writeFileSync(path.join(output, 'failure.log'), error.stack || String(error)); console.error(error); app.exit(1); });
