'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const vm = require('node:vm');
const { normalizeVideoOptions } = require('../src/video-options');
const { createFfmpegProgressParser } = require('../src/save-progress');
const profilePath = fsSync.mkdtempSync(path.join(os.tmpdir(), 'winscreen-options-check-'));
app.setPath('userData', profilePath);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const output = path.resolve('dist/verification/capture-improvements');
  await fs.mkdir(output, { recursive: true });
  await fs.rm(path.join(output, 'failure.log'), { force: true });
  await fs.writeFile(path.join(output, 'trace.log'), '');
  const trace = (message) => fsSync.appendFileSync(path.join(output, 'trace.log'), message + '\n');
  trace('start');
  const view = new BrowserWindow({ show: true, width: 1040, height: 760, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } });
  const errors = [];
  const screenshots = [];
  view.webContents.on('console-message', (_event, level, message) => {
    if (level === 3) errors.push(message);
    if (message === '__WSR_COMPACT__true') view.setContentSize(760, 128);
    if (message === '__WSR_COMPACT__false') view.setContentSize(1040, 760);
    if (message === '__WSR_AUDIO_SCREENSHOT__') screenshots.push(view.webContents.capturePage().then((capture) => fs.writeFile(path.join(output, 'live-audio-compact.png'), capture.toPNG())));
  });
  try {
    const html = (await fs.readFile(path.join(__dirname, '../src/index.html'), 'utf8'))
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
      .replace('href="styles.css"', `href="${pathToFileURL(path.join(__dirname, '../src/styles.css')).href}"`)
      .replaceAll('src="brand-icon.svg"', `src="${pathToFileURL(path.join(__dirname, '../src/brand-icon.svg')).href}"`);
    const previewPath = path.join(output, 'renderer-preview.html');
    await fs.writeFile(previewPath, html);
    await view.loadFile(previewPath);
    trace('html loaded');
    for (const module of ['keyboard-shortcuts', 'recording-pause', 'recording-controls', 'video-options', 'save-progress', 'audio-mix', 'audio-health', 'capture-preferences']) {
      await view.webContents.executeJavaScript((await fs.readFile(path.join(__dirname, '../src', `${module}.js`), 'utf8')) + '\n;void 0;');
      trace('module ' + module);
    }
    await view.webContents.executeJavaScript(`(${function () {
      window.__check = { chunks: [], inputs: [], contexts: [], signalGains: [], saved: false, errors: [] };
      window.addEventListener('error', (event) => window.__check.errors.push(event.message));
      window.addEventListener('unhandledrejection', (event) => window.__check.errors.push(String(event.reason)));
      const capabilities = { systemAudioAvailable: true };
      window.electronAPI = new Proxy({
        setCompactMode: async (enabled) => { console.log('__WSR_COMPACT__' + enabled); },
        getSources: async () => [{ id: 'screen:synthetic', name: 'Pantalla sintética', thumbnail: '', displayId: '1' }],
        configureCapture: async () => capabilities, clearCapture: async () => capabilities,
        getSaveDirectory: async () => ({ directory: 'Prueba aislada', available: true }),
        getDiskSpace: async () => ({ level: 'normal', availableBytes: 10 * 1024 ** 3 }),
        getStartWithWindows: async () => ({ enabled: false }),
        getKeyboardShortcuts: async () => window.recorderKeyboard.shortcuts,
        getRecoverySessions: async () => [],
        onSaveProgress(callback) { window.__progress = callback; },
        onDiskSpaceChanged(callback) { window.__disk = callback; },
        beginRecording: async (_audio, options) => { window.__check.options = options; return 'synthetic-recording'; },
        appendRecordingChunk: async (_id, bytes) => window.__check.chunks.push(Array.from(bytes)),
        completeRecording: async (_id, _audio, durationMs) => { window.__check.durationMs = durationMs; return { status: 'ready' }; },
        saveRecording: async () => {
          window.__progress({ stage: 'conversion', percent: 37 });
          window.__check.progress = document.getElementById('save-progress-bar').value;
          window.__check.saved = true;
          return { status: 'saved', path: 'Prueba aislada.webm' };
        }
      }, { get(target, name) { return target[name] || (String(name).startsWith('on') ? () => {} : async () => ({})); } });
      const makeAudio = () => {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        oscillator.frequency.value = 440;
        const destination = context.createMediaStreamDestination();
        const gain = context.createGain(); gain.gain.value = 0.2;
        oscillator.connect(gain); gain.connect(destination); oscillator.start();
        window.__check.signalGains.push(gain);
        window.__check.contexts.push(context);
        window.__check.inputs.push(destination.stream);
        void context.resume();
        return destination.stream;
      };
      Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', { value: async () => [{ kind: 'audioinput', deviceId: 'synthetic-mic', label: 'Micrófono sintético' }] });
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async (constraints) => { window.__check.microphoneConstraints = constraints; return makeAudio(); } });
      Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { value: async (constraints) => {
        window.__check.displayConstraints = constraints;
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
        const context = canvas.getContext('2d'); let frame = 0;
        window.__check.paint = setInterval(() => { context.fillStyle = frame++ % 2 ? '#334477' : '#445588'; context.fillRect(0, 0, 640, 360); }, 60);
        const stream = canvas.captureStream(constraints.video.frameRate.max);
        if (constraints.audio) makeAudio().getAudioTracks().forEach((track) => stream.addTrack(track));
        return stream;
      } });
    }} )()`, true);
    trace('mocks installed');
    await view.webContents.executeJavaScript(await fs.readFile(path.join(__dirname, '../src/renderer.js'), 'utf8'), true);
    trace('renderer loaded');
    const result = await view.webContents.executeJavaScript(`(${async function () {
      const get = (id) => document.getElementById(id);
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const until = async (predicate) => { for (let index = 0; index < 100; index++) { if (predicate()) return; await wait(50); } throw new Error('Timed out waiting for renderer'); };
      const assert = (condition, message) => { if (!condition) throw new Error(message); };
      await until(() => document.querySelector('.source-card'));
      document.querySelector('.source-card').click();
      await until(() => !get('start-recording').disabled);
      get('quality-profile').value = 'light'; get('quality-profile').dispatchEvent(new Event('change'));
      assert(get('video-size-select').value === '720' && get('frame-rate').value === '15', 'Profile did not update size/FPS');
      assert(get('compact-quality-profile').value === 'light', 'Compact profile not synchronized');
      get('microphone-toggle').click();
      await until(() => !get('test-microphone').disabled);
      get('microphone-device').value = 'synthetic-mic'; get('microphone-device').dispatchEvent(new Event('change'));
      get('test-microphone').click();
      await until(() => get('test-microphone').textContent === 'Finalizar prueba');
      await until(() => get('microphone-meter').value > 10);
      const level = get('microphone-meter').value;
      assert(level > 10, 'Microphone meter has no signal');
      get('microphone-volume').value = '0'; get('microphone-volume').dispatchEvent(new Event('input'));
      await wait(200);
      assert(get('microphone-meter').value < 1, 'Zero volume did not mute signal');
      get('microphone-volume').value = '50'; get('microphone-volume').dispatchEvent(new Event('input'));
      get('test-microphone').click();
      assert(window.__check.inputs[0].getTracks().every((track) => track.readyState === 'ended'), 'Preview did not release microphone');
      get('countdown-select').value = '0';
      get('start-recording').click();
      await until(() => !get('recording-actions').hidden);
      await until(() => get('live-mic').value > 1 && get('live-system').value > 1);
      window.__check.signalGains.forEach((gain) => { gain.gain.value = 3; });
      await until(() => get('audio-health').textContent.includes('volumen excesivo'));
      get('compact-toggle').click();
      await until(() => document.body.classList.contains('compact-mode')); await wait(200);
      const row = get('compact-controls-row'); const title = document.querySelector('.compact-titlebar');
      assert(row.scrollWidth <= row.clientWidth && title.scrollWidth <= title.clientWidth, 'Live audio overflows compact width');
      assert(get('compact-toolbar').getBoundingClientRect().bottom <= innerHeight + 1, 'Live audio overflows compact height');
      console.log('__WSR_AUDIO_SCREENSHOT__');
      get('compact-expand').click(); await wait(200);
      window.__check.clippingWarning = true;
      window.__check.signalGains.forEach((gain) => { gain.gain.value = 0; });
      await wait(10500);
      assert(get('audio-health').textContent.includes('sin señal'), 'Sustained silence warning missing');
      window.__check.silenceWarning = true;
      get('pause-recording').click(); await wait(250);
      assert(get('audio-health').textContent === '', 'Pause incorrectly reports silence');
      window.__check.signalGains.forEach((gain) => { gain.gain.value = 0.2; });
      get('pause-recording').click();
      await wait(500);
      get('pause-recording').click(); await wait(200); get('pause-recording').click();
      await wait(400);
      window.__disk({ level: 'critical', availableBytes: 100 * 1024 ** 2 });
      await until(() => window.__check.saved && !get('idle-actions').hidden && get('recording-actions').hidden);
      assert(window.__check.options.videoBitsPerSecond === 2000000, 'Recorder quality not forwarded');
      assert(window.__check.displayConstraints.video.frameRate.max === 15, 'Capture FPS not applied');
      assert(window.__check.microphoneConstraints.audio.deviceId.exact === 'synthetic-mic', 'Wrong microphone');
      assert(window.__check.progress === 37, 'Progress meter did not update');
      assert(get('disk-space-notice').textContent.includes('crítico'), 'Critical disk warning missing');
      assert(window.__check.inputs.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended')), 'Capture inputs not released');
      clearInterval(window.__check.paint);
      for (const context of window.__check.contexts) await context.close();
      return { options: window.__check.options, microphoneLevel: level, durationMs: window.__check.durationMs,
        liveMeters: true, clippingWarning: window.__check.clippingWarning, silenceWarning: window.__check.silenceWarning,
        progress: window.__check.progress, errors: window.__check.errors, bytes: window.__check.chunks.flat() };
    }} )()`, true);
    if (result.errors.length || errors.length) throw new Error(JSON.stringify([...result.errors, ...errors]));
    await Promise.all(screenshots);
    await fs.writeFile(path.join(output, 'capture.webm'), Buffer.from(result.bytes));
    delete result.bytes;
    const mainSource = await fs.readFile(path.join(__dirname, '../main.js'), 'utf8');
    const progress = [];
    const converter = vm.createContext({
      spawn, normalizeVideoOptions, createFfmpegProgressParser, activeChildProcess: null, activeCancellation: null,
      setTimeout, clearTimeout,
      encoderPolicy: { encode: async (convert) => convert('libopenh264') },
      getFfmpegPath: () => path.join(__dirname, '../vendor/ffmpeg/ffmpeg.exe'),
      notifySaveProgress: (stage, value) => progress.push({ stage, ...value })
    });
    for (const name of ['getOutputOptions', 'runChildProcess', 'runFfmpeg']) {
      const pattern = new RegExp('(?:async )?function ' + name + '\\(');
      const start = mainSource.search(pattern);
      const remainder = mainSource.slice(start);
      const next = remainder.slice(1).search(/\n(?:async )?function /);
      vm.runInContext(next === -1 ? remainder : remainder.slice(0, next + 1), converter);
    }
    await converter.runFfmpeg(path.join(output, 'capture.webm'), path.join(output, 'capture.mp4'), 'mp4', true, result.options, result.durationMs);
    if (!progress.some((item) => item.percent >= 0 && item.percent < 100) || progress.at(-1).percent !== 100) throw new Error('Missing real conversion progress');
    await converter.runChildProcess(converter.getFfmpegPath(), ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', path.join(output, 'capture.mp4'), '-enc_time_base:v', 'demux', '-f', 'null', '-'], 'FFmpeg');
    result.conversionProgress = progress;
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    await view.webContents.executeJavaScript("document.getElementById('microphone-device').scrollIntoView({ block: 'center' })");
    await view.webContents.executeJavaScript('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await fs.writeFile(path.join(output, 'audio-controls.png'), (await view.webContents.capturePage()).toPNG());
    view.setContentSize(760, 640);
    await view.webContents.executeJavaScript(`document.getElementById('compact-toggle').click();`);
    await view.webContents.executeJavaScript('new Promise((resolve) => setTimeout(resolve, 100))');
    await view.webContents.executeJavaScript(`document.getElementById('compact-settings').open = true;`);
    await view.webContents.executeJavaScript('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const fits = await view.webContents.executeJavaScript(`(() => { const panel = document.querySelector('.compact-settings-panel'); return panel.scrollWidth <= panel.clientWidth; })()`);
    if (!fits) throw new Error('Compact settings overflow');
    await fs.writeFile(path.join(output, 'compact-settings.png'), (await view.webContents.capturePage()).toPNG());
    console.log(JSON.stringify(result));
  } finally {
    view.destroy();
    await fs.rm(profilePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
  }
}).then(() => app.exit(0)).catch((error) => {
  fsSync.writeFileSync(path.resolve('dist/verification/capture-improvements/failure.log'), error.stack || String(error));
  console.error(error); app.exit(1);
});
