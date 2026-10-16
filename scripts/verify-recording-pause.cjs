'use strict';

// Isolated native MediaRecorder check using generated video/audio, never desktop or microphone.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

const temporaryUserData = fsSync.mkdtempSync(path.join(os.tmpdir(), 'winscreen-pause-check-'));
app.setPath('userData', temporaryUserData);
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const outputDirectory = path.resolve(process.argv[2] || 'dist/verification/pause-manual');
  await fs.mkdir(outputDirectory, { recursive: true });
  const window = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false, sandbox: true, contextIsolation: true } });
  try {
    await window.loadURL('data:text/html,<canvas width="320" height="180"></canvas>');
    await window.webContents.executeJavaScript(await fs.readFile(path.join(__dirname, '../src/recording-pause.js'), 'utf8'));
    const result = await window.webContents.executeJavaScript(`(${async function () {
      const canvas = document.querySelector('canvas');
      const context = canvas.getContext('2d');
      let frame = 0;
      const paint = setInterval(() => {
        context.fillStyle = frame++ % 2 ? '#263a5b' : '#405c89';
        context.fillRect(0, 0, 320, 180);
        context.fillStyle = 'white';
        context.font = '24px sans-serif';
        context.fillText('Prueba de pausa ' + frame, 15, 90);
      }, 30);
      const audio = new AudioContext();
      await audio.resume();
      const oscillator = audio.createOscillator();
      const destination = audio.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      const stream = canvas.captureStream(30);
      destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
      const chunks = [];
      recorder.addEventListener('dataavailable', (event) => chunks.push(event.data));
      const stopped = new Promise((resolve) => recorder.addEventListener('stop', resolve, { once: true }));
      const pause = window.recorderPause.createRecordingPauseController({ recorder, now: () => performance.now() });
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const states = [];
      recorder.start(100);
      await wait(350);
      pause.toggleManual();
      states.push(recorder.state);
      await wait(300);
      pause.updatePendingBytes(30 * 1024 * 1024);
      pause.updatePendingBytes(0);
      states.push(recorder.state);
      pause.toggleManual();
      states.push(recorder.state);
      await wait(350);
      pause.updatePendingBytes(30 * 1024 * 1024);
      pause.toggleManual();
      pause.toggleManual();
      states.push(recorder.state);
      await wait(200);
      pause.updatePendingBytes(0);
      states.push(recorder.state);
      await wait(350);
      pause.toggleManual();
      await wait(200);
      pause.stop();
      recorder.stop();
      await stopped;
      clearInterval(paint);
      oscillator.stop();
      stream.getTracks().forEach((track) => track.stop());
      await audio.close();
      return { states, pausedMilliseconds: pause.getPausedDuration(), bytes: Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())) };
    }} )()`);
    const expectedStates = ['paused', 'paused', 'recording', 'paused', 'recording'];
    if (JSON.stringify(result.states) !== JSON.stringify(expectedStates)) throw new Error('Unexpected native recorder states: ' + JSON.stringify(result.states));
    if (result.pausedMilliseconds < 650 || result.bytes.length === 0) throw new Error('Missing pause duration or video');
    await fs.writeFile(path.join(outputDirectory, 'native-pause.webm'), Buffer.from(result.bytes));
    const report = { states: result.states, pausedMilliseconds: result.pausedMilliseconds, bytes: result.bytes.length };
    await fs.writeFile(path.join(outputDirectory, 'result.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));

    // Render the production layout in a controlled paused state, without booting the app.
    const html = (await fs.readFile(path.join(__dirname, '../src/index.html'), 'utf8'))
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
      .replace('href="styles.css"', `href="${pathToFileURL(path.join(__dirname, '../src/styles.css')).href}"`)
      .replaceAll('src="brand-icon.svg"', `src="${pathToFileURL(path.join(__dirname, '../src/brand-icon.svg')).href}"`);
    const previewPath = path.join(outputDirectory, 'paused-preview.html');
    await fs.writeFile(previewPath, html);
    await window.loadFile(previewPath);
    await window.webContents.executeJavaScript(`
      document.getElementById('idle-actions').hidden = true;
      document.getElementById('recording-actions').hidden = false;
      document.getElementById('recording-label').classList.add('is-paused');
      document.getElementById('recording-copy').textContent = 'Grabación en pausa';
      for (const id of ['pause-recording', 'compact-pause']) {
        document.getElementById(id).textContent = 'Reanudar';
        document.getElementById(id).setAttribute('aria-pressed', 'true');
      }
      document.getElementById('status-text').textContent = 'Grabación en pausa';
      document.getElementById('compact-status-text').textContent = 'Grabación en pausa';
    `);
    window.setContentSize(1040, 760);
    await fs.writeFile(path.join(outputDirectory, 'paused-normal.png'), (await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript(`
      document.body.classList.add('compact-mode');
      document.getElementById('compact-toolbar').hidden = false;
      document.getElementById('compact-start').hidden = true;
      document.getElementById('compact-pause').hidden = false;
      document.getElementById('compact-stop').hidden = false;
    `);
    window.setContentSize(760, 160);
    const fits = await window.webContents.executeJavaScript(`(() => {
      const row = document.getElementById('compact-controls-row');
      return row.scrollWidth <= row.clientWidth;
    })()`);
    if (!fits) throw new Error('Compact pause controls overflow at minimum width');
    await fs.writeFile(path.join(outputDirectory, 'paused-compact.png'), (await window.webContents.capturePage()).toPNG());
  } finally {
    window.destroy();
    await fs.rm(temporaryUserData, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch((error) => {
      console.warn('No se pudo limpiar la carpeta temporal de verificación: ' + error.message);
    });
  }
}).then(() => app.exit(0)).catch((error) => { console.error(error); app.exit(1); });
