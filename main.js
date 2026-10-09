const { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, session, Tray } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');
const { createHash, randomUUID } = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const { fileURLToPath } = require('node:url');
const { allowMicrophoneRequest } = require('./src/permission-policy');
const { chooseUniqueMediaPath } = require('./src/save-paths');

const rendererPath = path.join(__dirname, 'src', 'index.html');
let mainWindow;
let tray;
let compactModeEnabled = false;
let compactSettingsExpanded = false;
let fullWindowState = null;
let windowMaximized = false;
let normalWindowBounds = null;
let selectedCapture = { source: null, systemAudio: false, microphone: false };
let recordingSession = null;
let activeChildProcess = null;
let downloadRequest = null;
let verifiedModelIdentity = null;
let lastCaptureFailure = null;
let closePromptOpen = false;
let allowWindowClose = false;

const modelConfig = {
  filename: 'ggml-base-q5_1.bin',
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/f281eb45af861ab5e5297d23694b7d46e090c02c/ggml-base-q5_1.bin?download=true',
  sha256: '422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898'
};
const MODEL_DOWNLOAD_MAX_BYTES = 100 * 1024 * 1024;

function isTrustedRenderer(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
    return false;
  }
  try {
    return path.resolve(fileURLToPath(event.senderFrame.url)) === path.resolve(rendererPath);
  } catch {
    return false;
  }
}

function registerHandler(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedRenderer(event)) {
      throw new Error('Solicitud IPC rechazada: origen no confiable.');
    }
    return handler(...args);
  });
}

async function getDesktopSources() {
  return desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 480, height: 270 },
    fetchWindowIcons: true
  });
}

async function getSourceById(sourceId) {
  if (typeof sourceId !== 'string' || sourceId.length > 512) return null;
  const sources = await getDesktopSources();
  return sources.find((source) => source.id === sourceId) ?? null;
}

function getFfmpegPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe');
  const bundledPath = path.join(__dirname, 'vendor', 'ffmpeg', 'ffmpeg.exe');
  return fs.existsSync(bundledPath) ? bundledPath : (process.env.FFMPEG_PATH || 'ffmpeg.exe');
}

function getWhisperCliPath() {
  const runtimeDirectory = app.isPackaged
    ? path.join(process.resourcesPath, 'whisper')
    : path.join(__dirname, 'vendor', 'whisper');
  return path.join(runtimeDirectory, 'whisper-cli.exe');
}

function getModelPath() {
  return path.join(app.getPath('userData'), 'models', modelConfig.filename);
}

function getSaveDirectorySettingsPath() {
  return path.join(app.getPath('userData'), 'save-directory.json');
}

async function readSaveDirectoryPreference() {
  try {
    const settings = JSON.parse(await fsp.readFile(getSaveDirectorySettingsPath(), 'utf8'));
    return typeof settings.directory === 'string' && settings.directory.trim()
      ? path.resolve(settings.directory)
      : null;
  } catch {
    return null;
  }
}

async function getSaveDirectoryStatus() {
  const directory = await readSaveDirectoryPreference();
  if (!directory) return { directory: null, available: true };
  try {
    return { directory, available: (await fsp.stat(directory)).isDirectory() };
  } catch {
    return { directory, available: false };
  }
}

async function chooseSaveDirectory() {
  const current = await readSaveDirectoryPreference();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Elegir carpeta de guardado',
    defaultPath: current || app.getPath('videos'),
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return getSaveDirectoryStatus();
  const directory = path.resolve(result.filePaths[0]);
  const stats = await fsp.stat(directory);
  if (!stats.isDirectory()) throw new Error('La ubicación elegida no es una carpeta válida.');
  await fsp.mkdir(path.dirname(getSaveDirectorySettingsPath()), { recursive: true });
  await fsp.writeFile(getSaveDirectorySettingsPath(), JSON.stringify({ directory }), 'utf8');
  return { directory, available: true };
}

async function resetSaveDirectory() {
  await fsp.rm(getSaveDirectorySettingsPath(), { force: true });
  return { directory: null, available: true };
}

function notifySaveProgress(stage) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('save-progress', { stage });
  }
}

function assertSaveSessionActive(currentSession) {
  if (recordingSession !== currentSession || currentSession.cancelRequested) {
    throw new Error('El guardado se canceló y la captura se descartó.');
  }
}

async function hashFile(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function requestHttpsResponse(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:' || redirects > 5) {
      reject(new Error('No se pudo descargar el modelo desde una dirección HTTPS válida.'));
      return;
    }
    const request = https.get(parsedUrl, { headers: { 'user-agent': 'WinScreenRecorder' } }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        requestHttpsResponse(new URL(response.headers.location, parsedUrl).href, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`No se pudo descargar el modelo (HTTP ${response.statusCode || 'sin respuesta'}).`));
        return;
      }
      resolve(response);
    });
    downloadRequest = request;
    request.once('error', reject);
    request.setTimeout(30_000, () => request.destroy(new Error('La descarga del modelo agotó el tiempo de espera.')));
  });
}

async function ensureWhisperModel() {
  const modelPath = getModelPath();
  const modelDirectory = path.dirname(modelPath);
  await fsp.mkdir(modelDirectory, { recursive: true });
  if (fs.existsSync(modelPath)) {
    const modelStat = await fsp.stat(modelPath);
    if (verifiedModelIdentity?.size === modelStat.size && verifiedModelIdentity?.mtimeMs === modelStat.mtimeMs) return modelPath;
    if (await hashFile(modelPath) === modelConfig.sha256) {
      verifiedModelIdentity = { size: modelStat.size, mtimeMs: modelStat.mtimeMs };
      return modelPath;
    }
    verifiedModelIdentity = null;
    await fsp.rm(modelPath, { force: true });
  }
  const staleDownloads = (await fsp.readdir(modelDirectory))
    .filter((name) => name.startsWith(`${modelConfig.filename}.`) && name.endsWith('.download'));
  await Promise.all(staleDownloads.map((name) => fsp.rm(path.join(modelDirectory, name), { force: true })));

  notifySaveProgress('model-download');
  const partialPath = `${modelPath}.${randomUUID()}.download`;
  try {
    const response = await requestHttpsResponse(modelConfig.url);
    const contentLength = Number(response.headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength > MODEL_DOWNLOAD_MAX_BYTES) {
      response.destroy(new Error('El modelo excede el tamaño máximo permitido.'));
      throw new Error('El modelo excede el tamaño máximo permitido.');
    }
    const output = fs.createWriteStream(partialPath, { flags: 'wx' });
    let receivedBytes = 0;
    const sizeLimit = new Transform({
      transform(chunk, encoding, callback) {
        receivedBytes += chunk.length;
        callback(receivedBytes > MODEL_DOWNLOAD_MAX_BYTES
          ? new Error('El modelo excede el tamaño máximo permitido.')
          : null, chunk);
      }
    });
    await pipeline(response, sizeLimit, output);
    downloadRequest = null;
    if (await hashFile(partialPath) !== modelConfig.sha256) {
      throw new Error('La verificación de integridad del modelo falló. Intenta descargarlo de nuevo.');
    }
    await fsp.rename(partialPath, modelPath);
    const modelStat = await fsp.stat(modelPath);
    verifiedModelIdentity = { size: modelStat.size, mtimeMs: modelStat.mtimeMs };
    return modelPath;
  } catch (error) {
    await fsp.rm(partialPath, { force: true }).catch(() => {});
    if (error.message.startsWith('La verificación de integridad')) throw error;
    throw new Error(`No se pudo descargar el modelo local de transcripción. Revisa la conexión y vuelve a guardar. Detalle: ${error.message}`);
  } finally {
    downloadRequest = null;
  }
}

function makeWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 760,
    minHeight: 600,
    frame: false,
    thickFrame: true,
    transparent: true,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'src', 'app-icon.ico'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.on('maximize', () => { windowMaximized = true; });
  mainWindow.on('unmaximize', () => { windowMaximized = false; });
  mainWindow.webContents.on('will-navigate', (event, destination) => {
    try {
      if (path.resolve(fileURLToPath(destination)) !== path.resolve(rendererPath)) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(rendererPath);

  mainWindow.on('close', (event) => {
    if (allowWindowClose) return;
    event.preventDefault();
    mainWindow.hide();
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function restoreFullWindowState() {
  if (!fullWindowState) return;
  const { bounds, maximized } = fullWindowState;
  mainWindow.setBounds(bounds, true);
  if (maximized) {
    mainWindow.maximize();
    windowMaximized = true;
  } else {
    windowMaximized = false;
  }
}

function setWindowMode(compact) {
  if (compactModeEnabled === compact) return { compact, settingsExpanded: compactSettingsExpanded };

  if (compact) {
    const wasMaximized = mainWindow.isMaximized() || windowMaximized;
    fullWindowState = {
      bounds: wasMaximized && normalWindowBounds ? normalWindowBounds : mainWindow.getBounds(),
      maximized: wasMaximized
    };
    mainWindow.setMinimumSize(760, 140);
    mainWindow.setAlwaysOnTop(true, 'floating');
    if (process.platform === 'win32') mainWindow.setContentProtection(true);
    mainWindow.setSize(1080, 160, true);
    compactSettingsExpanded = false;
    compactModeEnabled = true;
  } else {
    if (process.platform === 'win32') mainWindow.setContentProtection(false);
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setMinimumSize(760, 600);
    restoreFullWindowState();
    fullWindowState = null;
    compactSettingsExpanded = false;
    compactModeEnabled = false;
  }
  return { compact, settingsExpanded: compactSettingsExpanded };
}

function setCompactSettingsExpanded(expanded) {
  if (!compactModeEnabled || compactSettingsExpanded === expanded) return compactSettingsExpanded;
  const [width] = mainWindow.getSize();
  mainWindow.setSize(width, expanded ? 520 : 160, true);
  compactSettingsExpanded = expanded;
  return compactSettingsExpanded;
}

function toggleCompactModeFromShortcut() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) showMainWindow();
  const toggleWhenReady = () => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('toggle-compact-mode-request');
  };
  if (mainWindow.webContents.isLoading()) mainWindow.webContents.once('did-finish-load', toggleWhenReady);
  else toggleWhenReady();
}

function createTray() {
  const iconPath = path.join(__dirname, 'src', 'app-icon.ico');
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
  tray.setToolTip(app.getName());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Abrir ${app.getName()}`, click: showMainWindow },
    { type: 'separator' },
    { label: 'Salir', click: requestAppExit }
  ]));
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
}

async function requestAppExit() {
  if (closePromptOpen) return;
  if (recordingSession) {
    closePromptOpen = true;
    showMainWindow();
    try {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Grabación sin guardar',
        message: 'Hay una grabación activa o pendiente de guardar. Si sales, se eliminará.',
        buttons: ['Seguir aquí', 'Salir sin guardar'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      });
      if (response !== 1) return;
      await discardCurrentSession();
    } catch (error) {
      dialog.showErrorBox('No se pudo salir', error.message);
      return;
    } finally {
      closePromptOpen = false;
    }
  }
  allowWindowClose = true;
  app.quit();
}

function configureCaptureHandler() {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    try {
      const mainFrameMatches = Boolean(mainWindow && request.frame === mainWindow.webContents.mainFrame);
      if (!mainWindow || !request.frame || !mainFrameMatches) {
        lastCaptureFailure = 'La solicitud de captura no proviene de la ventana principal de WinScreen Recorder.';
        console.warn('Solicitud de captura rechazada: origen de ventana no válido.', { hasWindow: Boolean(mainWindow), hasFrame: Boolean(request.frame), mainFrameMatches });
        callback(null);
        return;
      }
      const source = selectedCapture.source;
      if (!source || !request.videoRequested) {
        lastCaptureFailure = source
          ? 'La solicitud no incluyó video. Vuelve a seleccionar la fuente e inténtalo de nuevo.'
          : 'La fuente elegida ya no está disponible. Actualiza las fuentes y selecciona una pantalla o ventana otra vez.';
        console.warn('Fuente de captura no disponible.', { sourceFound: Boolean(source), videoRequested: request.videoRequested });
        callback(null);
        return;
      }
      callback({
        video: source,
        ...(request.audioRequested && selectedCapture.systemAudio && process.platform === 'win32'
          ? { audio: 'loopback' }
          : {})
      });
    } catch {
      lastCaptureFailure = 'WinScreen Recorder no pudo preparar la fuente elegida. Actualiza las fuentes e inténtalo de nuevo.';
      console.warn('Error al seleccionar la fuente de captura.');
      callback(null);
    }
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const trustedContents = Boolean(
      mainWindow
      && webContents === mainWindow.webContents
      && details?.isMainFrame !== false
    );
    if (permission === 'display-capture') {
      const allowed = trustedContents && requestingOrigin?.startsWith('file://');
      if (!allowed) lastCaptureFailure = 'Windows/Electron rechazó el permiso de captura de pantalla para la ventana de la aplicación. Cierra y vuelve a abrir WinScreen Recorder; si persiste, instala la versión más reciente.';
      return allowed;
    }
    if (!trustedContents || !requestingOrigin?.startsWith('file://')) return false;
    // Electron 44 can report getDisplayMedia's permission check as `media`
    // without a mediaType. Only treat that legacy shape as screen capture
    // when the trusted app already has an explicitly selected desktop source.
    const legacyDisplayCapture = permission === 'media'
      && !details?.mediaType
      && Boolean(selectedCapture.source);
    return legacyDisplayCapture || (
      permission === 'media'
      && selectedCapture.microphone
      && details?.mediaType === 'audio'
    );
  });

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const trustedContents = Boolean(
      mainWindow
      && webContents === mainWindow.webContents
      && details?.isMainFrame !== false
      && details.requestingUrl?.startsWith('file://')
    );
    const mediaTypes = Array.isArray(details?.mediaTypes) ? details.mediaTypes : [];
    // In Electron 44, getDisplayMedia may arrive as `media` with no mediaTypes.
    // It is safe to permit that legacy request only for the trusted main frame
    // after the user selected a desktop source. Camera requests include video.
    const legacyDisplayCapture = permission === 'media'
      && mediaTypes.length === 0
      && Boolean(selectedCapture.source);
    const allowed = trustedContents && (
      permission === 'display-capture'
      || legacyDisplayCapture
      || allowMicrophoneRequest({
        trusted: trustedContents,
        permission,
        mediaTypes,
        microphoneEnabled: selectedCapture.microphone
      })
    );
    if (permission === 'display-capture' && !allowed) {
      lastCaptureFailure = 'La solicitud de captura fue bloqueada por los permisos internos de la aplicación. Cierra y vuelve a abrir WinScreen Recorder; si persiste, instala la versión más reciente.';
    }
    callback(allowed);
  });
}

function createRecordingSession() {
  if (recordingSession) throw new Error('Ya existe una grabación activa o pendiente de guardar.');
  const id = randomUUID();
  const filePath = path.join(app.getPath('temp'), `winscreen-${id}.webm`);
  const stream = fs.createWriteStream(filePath, { flags: 'wx' });
  const currentSession = { id, filePath, stream, status: 'recording', writeChain: Promise.resolve(), writeError: null };
  stream.on('error', (error) => { currentSession.writeError = error; });
  recordingSession = currentSession;
  return id;
}

function enqueueChunk(currentSession, chunk) {
  const bytes = Buffer.isBuffer(chunk)
    ? chunk
    : ArrayBuffer.isView(chunk)
      ? Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
      : chunk instanceof ArrayBuffer
        ? Buffer.from(chunk)
        : null;
  if (!bytes || bytes.length === 0 || bytes.length > 64 * 1024 * 1024) {
    throw new Error('El fragmento de grabación no tiene un tamaño o formato válido.');
  }
  currentSession.writeChain = currentSession.writeChain.then(() => new Promise((resolve, reject) => {
    if (currentSession.writeError) return reject(currentSession.writeError);
    currentSession.stream.write(bytes, (error) => error ? reject(error) : resolve());
  }));
  return currentSession.writeChain;
}

async function closeRecordingStream(currentSession) {
  await currentSession.writeChain;
  if (currentSession.writeError) throw currentSession.writeError;
  await new Promise((resolve, reject) => {
    currentSession.stream.once('error', reject);
    currentSession.stream.end(resolve);
  });
  currentSession.status = 'ready';
}

function getOutputOptions(format, hasAudio) {
  if (format === 'mp4' || format === 'mkv') {
    return [
      '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'libopenh264', '-b:v', '6M', '-pix_fmt', 'yuv420p',
      ...(hasAudio ? ['-c:a', 'aac', '-b:a', '160k'] : ['-an']),
      ...(format === 'mp4' ? ['-movflags', '+faststart'] : [])
    ];
  }
  if (format === 'gif') {
    return [
      '-filter_complex', '[0:v]fps=15,scale=w=\'min(1280,iw)\':h=-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5',
      '-an'
    ];
  }
  throw new Error('El formato de salida seleccionado no está permitido.');
}

function runChildProcess(executablePath, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    activeChildProcess = child;
    let stderr = '';
    child.stderr.on('data', (data) => { stderr = `${stderr}${data.toString()}`.slice(-8000); });
    child.once('error', (error) => {
      if (activeChildProcess === child) activeChildProcess = null;
      reject(new Error(`No se pudo iniciar ${label}: ${error.message}`));
    });
    child.once('close', (code) => {
      if (activeChildProcess === child) activeChildProcess = null;
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${label} terminó con el código ${code}.`));
    });
  });
}

function runFfmpeg(inputPath, outputPath, format, hasAudio) {
  return runChildProcess(getFfmpegPath(), [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath,
    ...getOutputOptions(format, hasAudio), outputPath
  ], 'FFmpeg');
}

function validateSrt(contents) {
  const normalized = contents.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';
  const blocks = normalized.split(/\n\s*\n/);
  const timecode = /^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}$/;
  for (const block of blocks) {
    const lines = block.split('\n');
    if (!/^\d+$/.test(lines[0] || '') || !timecode.test(lines[1] || '') || !lines.slice(2).join('\n').trim()) {
      throw new Error('El transcriptor generó subtítulos con un formato inesperado.');
    }
  }
  return `${normalized}\r\n`;
}

function getSubtitlePath(mediaPath) {
  const parsed = path.parse(mediaPath);
  return path.join(parsed.dir, `${parsed.name}.srt`);
}

function chooseAvailableMediaPath(targetPath) {
  if (fs.existsSync(targetPath)) return targetPath;
  return chooseUniqueMediaPath(targetPath, (candidate) => fs.existsSync(candidate) || fs.existsSync(getSubtitlePath(candidate)));
}

function safeCaptureFileName(sourceName) {
  const cleanedName = String(sourceName ?? '')
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 100)
    .trim();
  const isReservedWindowsName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleanedName);
  return cleanedName && !isReservedWindowsName ? cleanedName : 'grabacion';
}

async function ensureSessionTranscript(currentSession) {
  if (currentSession.subtitleTempPath && fs.existsSync(currentSession.subtitleTempPath)) {
    return currentSession.subtitleTempPath;
  }

  const whisperPath = getWhisperCliPath();
  if (!fs.existsSync(whisperPath)) {
    throw new Error('Falta el motor local de transcripción. Cierra la aplicación y vuelve a abrirla para repararlo.');
  }
  const modelPath = await ensureWhisperModel();
  const tempDirectory = await fsp.mkdtemp(path.join(app.getPath('temp'), 'winscreen-transcript-'));
  const audioPath = path.join(tempDirectory, 'audio.wav');
  const outputBase = path.join(tempDirectory, 'captions');
  const subtitlePath = `${outputBase}.srt`;
  try {
    notifySaveProgress('audio-preparation');
    await runChildProcess(getFfmpegPath(), [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', currentSession.filePath,
      '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', audioPath
    ], 'FFmpeg');
    notifySaveProgress('transcription');
    await runChildProcess(whisperPath, [
      '-m', modelPath, '-f', audioPath, '-l', 'auto', '-osrt', '-of', outputBase, '-t', '4'
    ], 'El transcriptor local');
    const contents = validateSrt(await fsp.readFile(subtitlePath, 'utf8'));
    await fsp.rm(audioPath, { force: true });
    await fsp.writeFile(subtitlePath, contents, 'utf8');
    assertSaveSessionActive(currentSession);
    currentSession.subtitleTempPath = subtitlePath;
    return subtitlePath;
  } catch (error) {
    await fsp.rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function saveRecording(id, format) {
  if (!recordingSession || recordingSession.id !== id || recordingSession.status !== 'ready') {
    throw new Error('La grabación ya no está disponible para guardar.');
  }
  if (!['webm', 'mp4', 'mkv', 'gif'].includes(format)) throw new Error('El formato de salida seleccionado no está permitido.');

  const label = { webm: 'WebM', mp4: 'MP4', mkv: 'MKV', gif: 'GIF' }[format];
  const sourceName = safeCaptureFileName(selectedCapture.source?.name);
  const defaultName = `${sourceName}-${new Date().toISOString().replace(/[:.]/g, '-')}.${format}`;
  const currentSession = recordingSession;
  const saveDirectory = await getSaveDirectoryStatus();
  let overwriteConfirmed = false;
  let targetPath;
  if (saveDirectory.directory) {
    if (!saveDirectory.available) {
      throw new Error('La carpeta predeterminada ya no está disponible. Elige otra en Preferencias / Configuración o restablécela.');
    }
    targetPath = chooseUniqueMediaPath(path.join(saveDirectory.directory, defaultName), (candidate) => fs.existsSync(candidate) || fs.existsSync(getSubtitlePath(candidate)));
  } else {
    const { filePath: chosenPath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: path.join(app.getPath('videos'), defaultName),
      filters: [{ name: `${label} (${format.toUpperCase()})`, extensions: [format] }],
      properties: ['showOverwriteConfirmation']
    });
    if (!chosenPath) return { status: 'cancelled' };
    targetPath = path.extname(chosenPath).toLowerCase() === `.${format}` ? chosenPath : `${chosenPath}.${format}`;
    overwriteConfirmed = fs.existsSync(targetPath);
  }
  let temporaryOutput = null;
  let temporarySubtitle = null;
  let stage = 'transcription';
  currentSession.status = 'saving';
  try {
    let subtitlePath = null;
    if (currentSession.hasAudio) subtitlePath = await ensureSessionTranscript(currentSession);
    assertSaveSessionActive(currentSession);

    if (currentSession.hasAudio && !overwriteConfirmed) targetPath = chooseAvailableMediaPath(targetPath);
    const subtitleTargetPath = currentSession.hasAudio ? getSubtitlePath(targetPath) : null;

    notifySaveProgress('finalizing');
    temporaryOutput = path.join(path.dirname(targetPath), `.${path.parse(targetPath).name}-${id}.partial.${format}`);
    currentSession.temporaryOutput = temporaryOutput;
    stage = format === 'webm' ? 'finalizing' : 'conversion';
    if (format === 'webm') await fsp.copyFile(currentSession.filePath, temporaryOutput);
    else await runFfmpeg(currentSession.filePath, temporaryOutput, format, currentSession.hasAudio);
    assertSaveSessionActive(currentSession);

    stage = 'finalizing';
    if ((await fsp.stat(temporaryOutput)).size === 0) throw new Error('La salida generada está vacía.');
    const outputs = [{ temporaryPath: temporaryOutput, targetPath }];
    if (subtitlePath) {
      temporarySubtitle = path.join(path.dirname(targetPath), `.${path.parse(targetPath).name}-${id}.partial.srt`);
      currentSession.temporarySubtitle = temporarySubtitle;
      await fsp.copyFile(subtitlePath, temporarySubtitle);
      outputs.push({ temporaryPath: temporarySubtitle, targetPath: subtitleTargetPath });
    }
    await commitOutputPair(outputs, currentSession, overwriteConfirmed);
    await fsp.rm(currentSession.filePath, { force: true }).catch(() => {});
    if (currentSession.subtitleTempPath) await fsp.rm(path.dirname(currentSession.subtitleTempPath), { recursive: true, force: true }).catch(() => {});
    recordingSession = null;
    return { status: 'saved', path: targetPath, subtitlePath: subtitlePath ? subtitleTargetPath : null };
  } catch (error) {
    if (temporaryOutput) await fsp.rm(temporaryOutput, { force: true }).catch(() => {});
    if (temporarySubtitle) await fsp.rm(temporarySubtitle, { force: true }).catch(() => {});
    if (recordingSession === currentSession) {
      currentSession.temporaryOutput = null;
      currentSession.temporarySubtitle = null;
      currentSession.status = 'ready';
    }
    if (stage === 'transcription') return { status: 'transcription-failed', message: error.message, canSaveWebm: true };
    if (stage === 'conversion') return { status: 'conversion-failed', message: error.message, canSaveWebm: true };
    return { status: 'save-failed', message: error.message, canSaveWebm: true };
  }
}

async function commitOutputPair(outputs, currentSession, overwriteConfirmed) {
  const backups = [];
  const installed = [];
  try {
    for (const output of outputs) {
      assertSaveSessionActive(currentSession);
      if (fs.existsSync(output.targetPath)) {
        if (!overwriteConfirmed) {
          throw new Error('El archivo de destino apareció mientras se guardaba. Intenta guardar con otro nombre.');
        }
        const backupPath = `${output.targetPath}.${currentSession.id}.backup`;
        await fsp.rename(output.targetPath, backupPath);
        backups.push({ targetPath: output.targetPath, backupPath });
      }
    }
    for (const output of outputs) {
      assertSaveSessionActive(currentSession);
      await fsp.rename(output.temporaryPath, output.targetPath);
      installed.push(output.targetPath);
    }
  } catch (error) {
    const rollbackFailures = [];
    for (const installedPath of installed) await fsp.rm(installedPath, { force: true }).catch(() => {});
    for (const backup of backups.reverse()) {
      await fsp.rename(backup.backupPath, backup.targetPath).catch(() => rollbackFailures.push(backup.backupPath));
    }
    if (rollbackFailures.length) {
      throw new Error(`${error.message} No se pudieron restaurar estos archivos anteriores: ${rollbackFailures.join(', ')}`);
    }
    throw error;
  }
  for (const backup of backups) await fsp.rm(backup.backupPath, { force: true }).catch(() => {});
}

async function discardCurrentSession() {
  const currentSession = recordingSession;
  if (currentSession) {
    currentSession.cancelRequested = true;
    recordingSession = null;
  }
  if (downloadRequest) {
    const request = downloadRequest;
    downloadRequest = null;
    request.destroy(new Error('La operación de guardado fue cancelada.'));
  }
  if (activeChildProcess) {
    const child = activeChildProcess;
    activeChildProcess = null;
    const processClosed = new Promise((resolve) => child.once('close', resolve));
    if (!child.killed) child.kill();
    await processClosed;
  }
  if (!currentSession) return;
  const closed = new Promise((resolve) => {
    if (currentSession.stream.closed) return resolve();
    currentSession.stream.once('close', resolve);
  });
  currentSession.stream.destroy();
  await closed;
  await fsp.rm(currentSession.filePath, { force: true }).catch(() => {});
  if (currentSession.temporaryOutput) await fsp.rm(currentSession.temporaryOutput, { force: true }).catch(() => {});
  if (currentSession.temporarySubtitle) await fsp.rm(currentSession.temporarySubtitle, { force: true }).catch(() => {});
  if (currentSession.subtitleTempPath) await fsp.rm(path.dirname(currentSession.subtitleTempPath), { recursive: true, force: true }).catch(() => {});
}

function registerIpcHandlers() {
  registerHandler('get-developer-info', async () => {
    const { author } = require('./package.json');
    return {
      name: app.getName(),
      version: app.getVersion(),
      developer: author.name,
      email: author.email
    };
  });
  registerHandler('get-save-directory', getSaveDirectoryStatus);
  registerHandler('choose-save-directory', chooseSaveDirectory);
  registerHandler('reset-save-directory', resetSaveDirectory);

  registerHandler('set-compact-mode', async (compact) => {
    if (typeof compact !== 'boolean') throw new Error('El modo compacto solicitado no es válido.');
    return setWindowMode(compact);
  });
  registerHandler('window-action', async (action) => {
    if (action === 'minimize') mainWindow.minimize();
    else if (action === 'toggle-maximize') {
      if (mainWindow.isMaximized() || windowMaximized) {
        mainWindow.unmaximize();
        if (normalWindowBounds) mainWindow.setBounds(normalWindowBounds, true);
        windowMaximized = false;
      } else {
        normalWindowBounds = mainWindow.getBounds();
        mainWindow.maximize();
        windowMaximized = true;
      }
    } else if (action === 'close') mainWindow.close();
    else throw new Error('La acción de ventana solicitada no es válida.');
  });
  registerHandler('set-compact-settings-open', async (expanded) => {
    if (typeof expanded !== 'boolean') throw new Error('El estado de ajustes compactos no es válido.');
    return setCompactSettingsExpanded(expanded);
  });

  registerHandler('get-sources', async () => {
    const sources = await getDesktopSources();
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      icon: source.appIcon?.toDataURL() ?? null
    }));
  });

  registerHandler('configure-capture', async (options) => {
    if (!options || typeof options !== 'object' || typeof options.systemAudio !== 'boolean' || typeof options.microphone !== 'boolean') {
      throw new Error('La configuración de captura no es válida.');
    }
    const source = await getSourceById(options.sourceId);
    if (!source) throw new Error('La pantalla o ventana seleccionada ya no está disponible. Actualiza las fuentes e inténtalo de nuevo.');
    const systemAudioAvailable = process.platform === 'win32';
    lastCaptureFailure = null;
    selectedCapture = {
      source,
      systemAudio: systemAudioAvailable && options.systemAudio,
      microphone: options.microphone
    };
    return { systemAudioAvailable };
  });

  registerHandler('begin-recording', async () => {
    if (!await getSourceById(selectedCapture.source?.id)) {
      throw new Error('La fuente seleccionada ya no está disponible. Actualiza las fuentes e inténtalo de nuevo.');
    }
    return createRecordingSession();
  });
  registerHandler('get-capture-failure', async () => {
    const message = lastCaptureFailure;
    lastCaptureFailure = null;
    return message;
  });
  registerHandler('append-recording-chunk', async (id, chunk) => {
    if (!recordingSession || recordingSession.id !== id || recordingSession.status !== 'recording') {
      throw new Error('La sesión de grabación no está activa.');
    }
    await enqueueChunk(recordingSession, chunk);
  });
  registerHandler('complete-recording', async (id, hasAudio) => {
    if (!recordingSession || recordingSession.id !== id || recordingSession.status !== 'recording' || typeof hasAudio !== 'boolean') {
      throw new Error('La sesión de grabación no puede finalizarse.');
    }
    try {
      await closeRecordingStream(recordingSession);
      recordingSession.hasAudio = hasAudio;
      return { status: 'ready' };
    } catch (error) {
      await discardCurrentSession();
      throw new Error(`No se pudo completar la grabación: ${error.message}`);
    }
  });
  registerHandler('save-recording', saveRecording);
  registerHandler('discard-recording', async (id) => {
    if (!recordingSession || recordingSession.id !== id || recordingSession.status !== 'ready') {
      throw new Error('La grabación pendiente ya no está disponible.');
    }
    await discardCurrentSession();
    return { status: 'discarded' };
  });
  registerHandler('abort-recording', async (id) => {
    if (!recordingSession || recordingSession.id !== id || !['recording', 'ready'].includes(recordingSession.status)) {
      throw new Error('La sesión de grabación ya no está disponible.');
    }
    await discardCurrentSession();
    return { status: 'discarded' };
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createTray();
  makeWindow();
  configureCaptureHandler();
  registerIpcHandlers();
  globalShortcut.register('CommandOrControl+Shift+M', toggleCompactModeFromShortcut);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  if (tray) tray.destroy();
  if (recordingSession) discardCurrentSession();
});
