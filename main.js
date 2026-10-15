const { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, screen, session, Tray } = require('electron');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');
const { createHash, randomUUID } = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const { fileURLToPath } = require('node:url');
const { allowMicrophoneRequest } = require('./src/permission-policy');
const { createRecoveryStore } = require('./src/recording-recovery');
const { isValidTrayCaptureState, getTrayStatusLabel } = require('./src/tray-status');
const { chooseUniqueMediaPath } = require('./src/save-paths');
const { mapRegionToBounds } = require('./src/region-geometry');
const { mapPhysicalRectToDisplay } = require('./src/window-geometry');
const execFileAsync = promisify(execFile);

const rendererPath = path.join(__dirname, 'src', 'index.html');
const recoveryRendererPath = path.join(__dirname, 'src', 'recovery.html');
const aboutRendererPath = path.join(__dirname, 'src', 'about.html');
const WINDOWS_STARTUP_ARGUMENT = '--started-from-windows';
const startedFromWindowsLogin = process.platform === 'win32'
  && process.argv.includes(WINDOWS_STARTUP_ARGUMENT);
let mainWindow;
let regionOverlayWindow;
let regionOverlayReadyPromise;
let regionOverlaySourceId;
let regionOverlaySourceBounds;
let regionOverlayGeneration = 0;
let regionOverlayPreviousAlwaysOnTop = false;
let regionOverlayChangedTopmost = false;
let regionSelectionWindow;
let regionSelectionBounds;
let regionSelectionResolve;
let regionSelectionReject;
let tray;
let trayCapturePhase = 'idle';
let trayCapturePaused = false;
let traySaveStage = null;
let trayRecoveryCount = 0;
let lastTrayToolTip = null;
let compactModeEnabled = false;
let compactSettingsExpanded = false;
let fullWindowState = null;
let windowMaximized = false;
let normalWindowBounds = null;
let selectedCapture = { source: null, systemAudio: false, microphone: false };
let recordingSession = null;
let recoveryStore = null;
let recoveryWindow = null;
let aboutWindow = null;
let recoverySaveOwner = null;
let preserveRecordingForExitResolve = null;
let preserveRecordingForExitTimer = null;
let activeSavePromise = null;
let isPreparingQuit = false;
let allowQuitAfterPreservation = false;
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

function isTrustedRecoveryRenderer(event) {
  if (!recoveryWindow || event.sender !== recoveryWindow.webContents || event.senderFrame !== recoveryWindow.webContents.mainFrame) {
    return false;
  }
  try {
    return path.resolve(fileURLToPath(event.senderFrame.url)) === path.resolve(recoveryRendererPath);
  } catch {
    return false;
  }
}

function registerRecoveryHandler(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedRecoveryRenderer(event)) {
      throw new Error('Solicitud de recuperación rechazada: origen no confiable.');
    }
    return handler(...args, recoveryWindow);
  });
}

function isTrustedAboutRenderer(event) {
  if (!aboutWindow || event.sender !== aboutWindow.webContents || event.senderFrame !== aboutWindow.webContents.mainFrame) return false;
  try {
    return path.resolve(fileURLToPath(event.senderFrame.url)) === path.resolve(aboutRendererPath);
  } catch {
    return false;
  }
}

function getAppInformation() {
  const { author, productName } = require('./package.json');
  return {
    name: productName || app.getName(),
    version: app.getVersion(),
    developer: author.name,
    email: author.email
  };
}

function getLoginItemIdentity() {
  const args = app.isPackaged ? [] : [app.getAppPath()];
  if (process.platform === 'win32') args.push(WINDOWS_STARTUP_ARGUMENT);
  return { path: process.execPath, args };
}

function migrateWindowsLoginItem() {
  if (process.platform !== 'win32') return;

  const legacyIdentity = {
    path: process.execPath,
    args: app.isPackaged ? [] : [app.getAppPath()]
  };
  const legacySettings = app.getLoginItemSettings(legacyIdentity);
  if (!legacySettings.openAtLogin) return;

  app.setLoginItemSettings({
    ...getLoginItemIdentity(),
    openAtLogin: true,
    enabled: true
  });
}

async function getDesktopSources() {
  return desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 480, height: 270 },
    fetchWindowIcons: true
  });
}

async function getWindowCaptureBounds(source) {
  const match = /^window:(\d+):/.exec(source.id);
  if (!match) throw new Error('No se pudo identificar la ventana capturada.');
  const handle = BigInt(match[1]);
  const script = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; } [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; } public static class WinScreenNative { [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext); [DllImport("user32.dll", SetLastError=true)] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect); [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, ref RECT rect, int size); [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags); [DllImport("user32.dll", SetLastError=true)] public static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info); }'; $previousDpiContext = [WinScreenNative]::SetThreadDpiAwarenessContext([IntPtr](-4)); if ($previousDpiContext -eq [IntPtr]::Zero) { exit 4 }; $handle = [IntPtr]${handle}; $rect = New-Object RECT; if (-not [WinScreenNative]::GetWindowRect($handle, [ref]$rect)) { exit 2 }; $visibleRect = New-Object RECT; if ([WinScreenNative]::DwmGetWindowAttribute($handle, 9, [ref]$visibleRect, [Runtime.InteropServices.Marshal]::SizeOf($visibleRect)) -eq 0) { $rect = $visibleRect }; $monitor = [WinScreenNative]::MonitorFromWindow($handle, 2); $info = New-Object MONITORINFO; $info.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($info); if (-not [WinScreenNative]::GetMonitorInfo($monitor, [ref]$info)) { exit 3 }; [Console]::WriteLine("$($rect.Left),$($rect.Top),$($rect.Right - $rect.Left),$($rect.Bottom - $rect.Top),$($info.rcMonitor.Left),$($info.rcMonitor.Top),$($info.rcMonitor.Right - $info.rcMonitor.Left),$($info.rcMonitor.Bottom - $info.rcMonitor.Top)")`;
  const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedScript
  ], { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 });
  const values = stdout.trim().split(',').map(Number);
  if (values.length !== 8 || !values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0 || values[6] <= 0 || values[7] <= 0) {
    throw new Error('No se pudo obtener la posición de la ventana capturada.');
  }
  const displays = screen.getAllDisplays();
  const display = displays.find((item) => String(item.id) === source.display_id)
    || displays.reduce((nearest, item) => {
      const scale = item.scaleFactor || 1;
      const centerX = (values[0] + values[2] / 2) / scale;
      const centerY = (values[1] + values[3] / 2) / scale;
      const distance = Math.hypot(centerX - (item.bounds.x + item.bounds.width / 2), centerY - (item.bounds.y + item.bounds.height / 2));
      const nearestScale = nearest?.scaleFactor || 1;
      const nearestCenterX = (values[0] + values[2] / 2) / nearestScale;
      const nearestCenterY = (values[1] + values[3] / 2) / nearestScale;
      const nearestDistance = nearest ? Math.hypot(nearestCenterX - (nearest.bounds.x + nearest.bounds.width / 2), nearestCenterY - (nearest.bounds.y + nearest.bounds.height / 2)) : Infinity;
      return distance < nearestDistance ? item : nearest;
    }, null);
  if (!display) throw new Error('No se encontró la pantalla de la ventana seleccionada.');
  const [left, top, width, height, monitorLeft, monitorTop, monitorWidth, monitorHeight] = values;
  return mapPhysicalRectToDisplay(
    { x: left, y: top, width, height },
    { x: monitorLeft, y: monitorTop, width: monitorWidth, height: monitorHeight },
    display
  );
}

async function getCaptureSourceBounds(source) {
  if (source.id.startsWith('window:')) return getWindowCaptureBounds(source);
  const displays = screen.getAllDisplays();
  const displayId = source.display_id || source.id.match(/^screen:(\d+)/)?.[1];
  const display = displays.find((item) => String(item.id) === displayId) || displays[0];
  if (!display) throw new Error('No se encontró la pantalla de la fuente seleccionada.');
  return display.bounds;
}

async function updateRegionOverlay(region, frame, mode = 'region') {
  if (!region) {
    hideRegionOverlay();
    return;
  }
  if (!selectedCapture.source || !frame || !Number.isFinite(frame.width) || !Number.isFinite(frame.height)
    || ![region.x, region.y, region.width, region.height].every(Number.isFinite)
    || region.width < 16 || region.height < 16) {
    throw new Error('No se pudo actualizar el resaltado del área.');
  }
  const sourceId = selectedCapture.source.id;
  const generation = regionOverlayGeneration;
  if (regionOverlaySourceId !== sourceId || !regionOverlaySourceBounds) {
    regionOverlaySourceId = sourceId;
    regionOverlaySourceBounds = getCaptureSourceBounds(selectedCapture.source);
  }
  const sourceBounds = await regionOverlaySourceBounds;
  if (generation !== regionOverlayGeneration) return;
  const bounds = mapRegionToBounds(region, frame, sourceBounds);
  let overlayCreated = false;
  if (!regionOverlayWindow || regionOverlayWindow.isDestroyed()) {
    if (mode === 'region') {
      regionOverlayPreviousAlwaysOnTop = mainWindow.isAlwaysOnTop();
      mainWindow.setAlwaysOnTop(true, 'floating');
      regionOverlayChangedTopmost = true;
    }
    try {
      const overlay = new BrowserWindow({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        hasShadow: false,
        focusable: false,
        skipTaskbar: true,
        show: false,
        webPreferences: {
          preload: path.join(__dirname, 'src', 'region-overlay-preload.js'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true
        }
      });
      regionOverlayWindow = overlay;
      overlayCreated = true;
      overlay.setAlwaysOnTop(true, 'floating');
      overlay.setIgnoreMouseEvents(true);
      overlay.on('closed', () => { if (regionOverlayWindow === overlay) regionOverlayWindow = null; });
      regionOverlayReadyPromise = overlay.loadFile(path.join(__dirname, 'src', 'region-overlay.html')).then(() => {
        if (generation === regionOverlayGeneration && !overlay.isDestroyed()) overlay.showInactive();
      });
    } catch (error) {
      hideRegionOverlay();
      throw error;
    }
  } else {
    regionOverlayWindow.setBounds(bounds, false);
  }
  try {
    await regionOverlayReadyPromise;
  } catch (error) {
    hideRegionOverlay();
    throw error;
  }
  if (generation !== regionOverlayGeneration || !regionOverlayWindow || regionOverlayWindow.isDestroyed()) return;
  regionOverlayWindow.setBounds(bounds, false);
  regionOverlayWindow.webContents.send('region-highlight', { width: bounds.width, height: bounds.height, mode });
  if (overlayCreated && mode === 'region') mainWindow.moveTop();
}

async function showSelectedSourceHighlight(sourceId) {
  const source = selectedCapture.source;
  if (!source || source.id !== sourceId || (!source.id.startsWith('screen:') && !source.id.startsWith('window:'))) {
    hideRegionOverlay();
    return;
  }
  if (regionOverlayWindow && !regionOverlayWindow.isDestroyed() && regionOverlaySourceId === sourceId) return;
  hideRegionOverlay();
  const generation = regionOverlayGeneration;
  const size = source.thumbnail.getSize();
  regionOverlaySourceId = sourceId;
  regionOverlaySourceBounds = getCaptureSourceBounds(source);
  await regionOverlaySourceBounds;
  if (generation !== regionOverlayGeneration || selectedCapture.source?.id !== sourceId) return;
  await updateRegionOverlay({ x: 0, y: 0, width: size.width, height: size.height }, size, 'source');
}

async function showSelectedRegionHighlight(region, sourceId) {
  const source = selectedCapture.source;
  if (!source || !source.id.startsWith('screen:') || source.id !== sourceId || !isValidDesktopRegion(region)) {
    throw new Error('No se pudo resaltar la porción seleccionada en el escritorio.');
  }
  const bounds = await getCaptureSourceBounds(source);
  if (selectedCapture.source?.id !== sourceId) return;
  const rectangle = {
    x: region.x * bounds.width,
    y: region.y * bounds.height,
    width: region.width * bounds.width,
    height: region.height * bounds.height
  };
  const frame = { width: bounds.width, height: bounds.height };
  return updateRegionOverlay(rectangle, frame, 'persistent-region');
}

function finishDesktopRegionSelection(region, error) {
  const selectionWindow = regionSelectionWindow;
  const resolve = regionSelectionResolve;
  const reject = regionSelectionReject;
  regionSelectionWindow = null;
  regionSelectionBounds = null;
  regionSelectionResolve = null;
  regionSelectionReject = null;
  if (selectionWindow && !selectionWindow.isDestroyed()) {
    selectionWindow.hide();
    selectionWindow.close();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
  if (error) reject?.(error);
  else resolve?.(region);
}

async function selectCaptureRegionOnDesktop() {
  const source = selectedCapture.source;
  if (!source?.id.startsWith('screen:')) {
    throw new Error('Selecciona una pantalla para marcar una porción del escritorio.');
  }
  if (regionSelectionWindow) throw new Error('Ya hay una selección de área en curso.');
  const bounds = await getCaptureSourceBounds(source);
  hideRegionOverlay();
  return new Promise((resolve, reject) => {
    regionSelectionResolve = resolve;
    regionSelectionReject = reject;
    regionSelectionBounds = bounds;
    try {
      const overlay = new BrowserWindow({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        hasShadow: false,
        focusable: true,
        movable: false,
        resizable: false,
        skipTaskbar: true,
        show: false,
        webPreferences: {
          preload: path.join(__dirname, 'src', 'region-overlay-preload.js'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true
        }
      });
      regionSelectionWindow = overlay;
      overlay.setAlwaysOnTop(true, 'floating');
      overlay.setIgnoreMouseEvents(false);
      overlay.on('closed', () => {
        if (regionSelectionWindow === overlay) finishDesktopRegionSelection(null);
      });
      overlay.loadFile(path.join(__dirname, 'src', 'region-overlay.html')).then(() => {
        if (regionSelectionWindow !== overlay || overlay.isDestroyed()) return;
        overlay.webContents.send('region-selection-start', { width: bounds.width, height: bounds.height });
        mainWindow.hide();
        overlay.show();
        overlay.focus();
      }).catch((error) => finishDesktopRegionSelection(null, error));
      mainWindow.hide();
    } catch (error) {
      finishDesktopRegionSelection(null, error);
    }
  });
}

function isValidDesktopRegion(region) {
  return region && typeof region === 'object'
    && [region.x, region.y, region.width, region.height].every(Number.isFinite)
    && region.x >= 0 && region.y >= 0 && region.width > 0 && region.height > 0
    && region.x + region.width <= 1.001 && region.y + region.height <= 1.001;
}

function handleDesktopRegionSelection(event, region) {
  const selectionWindow = regionSelectionWindow;
  if (!selectionWindow || selectionWindow.isDestroyed() || event.sender !== selectionWindow.webContents) return;
  if (region !== null && !isValidDesktopRegion(region)) return;
  if (region && (!regionSelectionBounds || region.width * regionSelectionBounds.width < 16 || region.height * regionSelectionBounds.height < 16)) return;
  finishDesktopRegionSelection(region);
}

function hideRegionOverlay() {
  regionOverlayGeneration += 1;
  if (regionOverlayWindow && !regionOverlayWindow.isDestroyed()) {
    regionOverlayWindow.hide();
    regionOverlayWindow.close();
  }
  regionOverlayWindow = null;
  regionOverlayReadyPromise = null;
  regionOverlaySourceId = null;
  regionOverlaySourceBounds = null;
  if (regionOverlayChangedTopmost && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(regionOverlayPreviousAlwaysOnTop, regionOverlayPreviousAlwaysOnTop ? 'floating' : 'normal');
  }
  regionOverlayChangedTopmost = false;
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

function getDefaultSaveDirectory() {
  return path.join(app.getPath('videos'), 'WinScreenRecorder');
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
  const customDirectory = await readSaveDirectoryPreference();
  const directory = customDirectory || getDefaultSaveDirectory();
  try {
    if (!customDirectory) await fsp.mkdir(directory, { recursive: true });
    return { directory, custom: Boolean(customDirectory), available: (await fsp.stat(directory)).isDirectory() };
  } catch {
    return { directory, custom: Boolean(customDirectory), available: false };
  }
}

async function chooseSaveDirectory() {
  const current = await readSaveDirectoryPreference();
  const currentStatus = await getSaveDirectoryStatus();
  const defaultDirectory = getDefaultSaveDirectory();
  await fsp.mkdir(defaultDirectory, { recursive: true });
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Elegir carpeta de guardado',
    defaultPath: currentStatus.available ? current || currentStatus.directory : defaultDirectory,
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return getSaveDirectoryStatus();
  const directory = path.resolve(result.filePaths[0]);
  const stats = await fsp.stat(directory);
  if (!stats.isDirectory()) throw new Error('La ubicación elegida no es una carpeta válida.');
  await fsp.mkdir(path.dirname(getSaveDirectorySettingsPath()), { recursive: true });
  await fsp.writeFile(getSaveDirectorySettingsPath(), JSON.stringify({ directory }), 'utf8');
  return { directory, custom: true, available: true };
}

async function resetSaveDirectory() {
  await fsp.rm(getSaveDirectorySettingsPath(), { force: true });
  return getSaveDirectoryStatus();
}

function notifySaveProgress(stage) {
  traySaveStage = stage;
  refreshTrayMenu();
  const targetWindow = recoverySaveOwner || mainWindow;
  if (targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.webContents.send('save-progress', { stage });
  }
}

async function setRecoverySessionState(currentSession, state, failureStage = null, failureCode = null) {
  if (!recoveryStore || !currentSession?.recoveryManaged) return;
  const record = await recoveryStore.updateSession(currentSession.id, {
    state,
    failureStage,
    failureCode
  });
  currentSession.recoveryRecord = record;
  refreshTrayMenu();
}

async function getRecoverySummaries() {
  if (!recoveryStore) return [];
  const sessions = await recoveryStore.listSessions();
  return sessions.filter((record) => !recordingSession || record.id !== recordingSession.id).map((record) => ({
    id: record.id,
    sourceName: record.sourceName,
    startedAt: record.startedAt,
    state: record.state,
    failureStage: record.failureStage,
    failureCode: record.failureCode,
    mediaExists: record.mediaExists,
    mediaSize: record.mediaSize,
    manifestInvalid: Boolean(record.manifestInvalid),
    blockedByActiveRecording: Boolean(recordingSession)
  }));
}

async function notifyRecoverySessionsChanged() {
  const sessions = await getRecoverySummaries().catch(() => []);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('recovery-sessions-changed', sessions.length);
  }
  if (recoveryWindow && !recoveryWindow.isDestroyed()) {
    recoveryWindow.webContents.send('recovery-sessions-changed');
  }
  refreshTrayMenu(sessions.length);
}

function assertSaveSessionActive(currentSession) {
  if (recordingSession !== currentSession || currentSession.cancelRequested) {
    throw new Error('El guardado se canceló.');
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
  mainWindow.once('ready-to-show', () => {
    if (startedFromWindowsLogin) mainWindow.hide();
    else mainWindow.show();
  });
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

function openRecoveryWindow() {
  if (recoveryWindow && !recoveryWindow.isDestroyed()) {
    if (recoveryWindow.isMinimized()) recoveryWindow.restore();
    recoveryWindow.show();
    recoveryWindow.focus();
    return;
  }

  recoveryWindow = new BrowserWindow({
    width: 760,
    height: 620,
    minWidth: 620,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b1220',
    icon: path.join(__dirname, 'src', 'app-icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'src', 'recovery-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });
  recoveryWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  recoveryWindow.webContents.on('will-navigate', (event, destination) => {
    try {
      if (path.resolve(fileURLToPath(destination)) !== path.resolve(recoveryRendererPath)) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  recoveryWindow.once('ready-to-show', () => {
    if (!recoveryWindow.isDestroyed()) recoveryWindow.show();
  });
  recoveryWindow.on('closed', () => {
    recoveryWindow = null;
  });
  recoveryWindow.loadFile(recoveryRendererPath);
}

function openAboutWindow() {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    if (aboutWindow.isMinimized()) aboutWindow.restore();
    aboutWindow.show();
    aboutWindow.focus();
    return;
  }
  const window = new BrowserWindow({
    width: 860,
    height: 760,
    minWidth: 640,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    title: 'Acerca de WinScreen Recorder',
    backgroundColor: '#0b1020',
    icon: path.join(__dirname, 'src', 'app-icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'src', 'about-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });
  aboutWindow = window;
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, destination) => {
    try {
      if (path.resolve(fileURLToPath(destination)) !== path.resolve(aboutRendererPath)) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) window.show();
  });
  window.on('closed', () => { if (aboutWindow === window) aboutWindow = null; });
  window.loadFile(aboutRendererPath);
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

function setCompactSettingsExpanded(expanded, requestedHeight) {
  if (!compactModeEnabled || compactSettingsExpanded === expanded) return compactSettingsExpanded;
  const [width] = mainWindow.getSize();
  mainWindow.setSize(width, expanded ? requestedHeight : 160, true);
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

function refreshTrayMenu(recoveryCount = trayRecoveryCount) {
  if (Number.isInteger(recoveryCount) && recoveryCount >= 0) trayRecoveryCount = recoveryCount;
  if (!tray || tray.isDestroyed()) return;
  const statusLabel = getTrayStatusLabel({
    phase: trayCapturePhase,
    paused: trayCapturePaused,
    sessionStatus: recordingSession?.status,
    saveActive: Boolean(activeSavePromise),
    saveStage: traySaveStage,
    failureStage: recordingSession?.recoveryRecord?.failureStage,
    captureWriteFailed: Boolean(recordingSession?.writeError)
  });
  const recoveryLabel = trayRecoveryCount === 1
    ? '1 grabación por recuperar'
    : `${trayRecoveryCount} grabaciones por recuperar`;
  const toolTip = `${app.getName()}\n${statusLabel}${trayRecoveryCount ? `\n${recoveryLabel}` : ''}`;
  if (toolTip === lastTrayToolTip) return;
  const template = [
    { label: `Estado: ${statusLabel}`, enabled: false },
    { type: 'separator' },
    { label: `Abrir ${app.getName()}`, click: showMainWindow }
  ];
  if (trayRecoveryCount > 0) {
    template.push({
      label: `Hay grabaciones por recuperar (${trayRecoveryCount})`,
      click: openRecoveryWindow
    });
  }
  template.push({ type: 'separator' }, { label: 'Salir', click: requestAppExit });
  tray.setToolTip(toolTip);
  tray.setContextMenu(Menu.buildFromTemplate(template));
  lastTrayToolTip = toolTip;
}

function createTray() {
  const iconPath = path.join(__dirname, 'src', 'app-icon.ico');
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
  refreshTrayMenu();
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
        message: 'Hay una grabación activa o pendiente de guardar. Se conservará en Recuperación para continuar después.',
        buttons: ['Seguir aquí', 'Conservar y salir'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      });
      if (response !== 1) return;
      const currentSession = recordingSession;
      if (currentSession.status === 'recording') {
        const preserved = await new Promise((resolve) => {
          preserveRecordingForExitResolve = resolve;
          preserveRecordingForExitTimer = setTimeout(() => {
            preserveRecordingForExitTimer = null;
            preserveRecordingForExitResolve = null;
            resolve(false);
          }, 10000);
          mainWindow.webContents.send('preserve-recording-for-exit', currentSession.id);
        });
        if (!preserved && recordingSession?.id === currentSession.id) {
          await preserveCurrentSession(currentSession.id);
        }
      } else if (currentSession.status === 'saving') {
        currentSession.cancelRequested = true;
        if (downloadRequest) {
          downloadRequest.destroy(new Error('Se conservará la grabación para reanudar el guardado después.'));
          downloadRequest = null;
        }
        if (activeChildProcess && !activeChildProcess.killed) activeChildProcess.kill();
        await activeSavePromise?.catch(() => {});
        if (recordingSession === currentSession) recordingSession = null;
      } else {
        recordingSession = null;
      }
    } catch (error) {
      dialog.showErrorBox('No se pudo salir', error.message);
      return;
    } finally {
      closePromptOpen = false;
    }
  }
  allowWindowClose = true;
  allowQuitAfterPreservation = true;
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
      hideRegionOverlay();
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

async function createRecordingSession(hasAudio) {
  if (recordingSession || activeSavePromise) throw new Error('Ya existe una grabación activa o pendiente de guardar.');
  const id = randomUUID();
  if (!recoveryStore) throw new Error('El sistema de recuperación todavía no está listo.');
  const saveDirectory = await getSaveDirectoryStatus();
  if (!saveDirectory.available) {
    throw new Error('La carpeta de guardado no está disponible. Elige otra en Preferencias antes de grabar.');
  }
  const recoveryRecord = await recoveryStore.createSession({
    id,
    videoDirectory: saveDirectory.directory,
    sourceName: selectedCapture.source?.name,
    startedAt: new Date().toISOString(),
    hasAudio: Boolean(hasAudio)
  });
  const filePath = recoveryRecord.mediaPath;
  const stream = fs.createWriteStream(filePath, { flags: 'r+' });
  try {
    await new Promise((resolve, reject) => {
      stream.once('open', resolve);
      stream.once('error', reject);
    });
  } catch (error) {
    stream.destroy();
    await recoveryStore.removeSession(id).catch(() => {});
    throw new Error(`No se pudo iniciar el archivo de recuperación: ${error.message}`);
  }
  const currentSession = {
    id,
    filePath,
    stream,
    sourceName: selectedCapture.source?.name,
    status: 'recording',
    writeChain: Promise.resolve(),
    writeError: null,
    recoveryManaged: true,
    recoveryRecord
  };
  stream.on('error', (error) => {
    currentSession.writeError = error;
    refreshTrayMenu();
  });
  recordingSession = currentSession;
  refreshTrayMenu();
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

async function loadRecoveryRecording(id) {
  if (!recoveryStore) throw new Error('El sistema de recuperación todavía no está listo.');
  const record = await recoveryStore.getSession(id);
  if (!record || record.manifestInvalid) throw new Error('La sesión de recuperación ya no está disponible.');
  if (!record.mediaExists || record.mediaSize === 0) throw new Error('No se encontró un archivo recuperable para esta sesión.');
  return {
    id: record.id,
    filePath: record.mediaPath,
    sourceName: record.sourceName,
    hasAudio: record.hasAudio,
    status: record.state,
    writeChain: Promise.resolve(),
    writeError: null,
    stream: null,
    recoveryManaged: true,
    recoveryRecord: record
  };
}

async function repairInterruptedRecording(currentSession) {
  const record = currentSession.recoveryRecord;
  if (!record || !['recording', 'interrupted-recording'].includes(record.state)) return;
  const mediaPath = currentSession.filePath;
  const recoveryDirectory = path.dirname(mediaPath);
  const backupPath = `${mediaPath}.repair-backup`;
  const temporaryPath = path.join(recoveryDirectory, `.${currentSession.id}-${randomUUID()}.repair.partial.webm`);
  let replacementComplete = false;
  try {
    try {
      await fsp.access(mediaPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fsp.rename(backupPath, mediaPath);
    }
    if (fs.existsSync(backupPath)) await fsp.rm(backupPath, { force: true });
    if ((await fsp.stat(mediaPath)).size === 0) throw new Error('El archivo parcial está vacío.');
    await runChildProcess(getFfmpegPath(), [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-fflags', '+genpts', '-i', mediaPath,
      '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-f', 'webm', temporaryPath
    ], 'La recuperación de video');
    if ((await fsp.stat(temporaryPath)).size === 0) throw new Error('La recuperación generó un archivo vacío.');
    await fsp.rename(mediaPath, backupPath);
    try {
      await fsp.rename(temporaryPath, mediaPath);
      replacementComplete = true;
    } catch (error) {
      await fsp.rename(backupPath, mediaPath).catch(() => {});
      throw error;
    }
    await fsp.rm(backupPath, { force: true }).catch(() => {});
    currentSession.recoveryRecord = await recoveryStore.updateSession(currentSession.id, {
      state: 'ready',
      failureStage: null,
      failureCode: null
    });
    currentSession.status = 'ready';
  } catch (error) {
    if (!fs.existsSync(mediaPath) && fs.existsSync(backupPath)) {
      await fsp.rename(backupPath, mediaPath).catch(() => {});
    }
    if (currentSession.cancelRequested) {
      await recoveryStore.updateSession(currentSession.id, {
        state: replacementComplete ? 'ready' : 'interrupted-recording',
        failureStage: null,
        failureCode: null
      }).catch(() => {});
      throw new Error('La recuperación se detuvo y el original se conservó para continuar después.');
    }
    await recoveryStore.updateSession(currentSession.id, replacementComplete
      ? { state: 'ready', failureStage: null, failureCode: null }
      : { state: 'unrecoverable', failureStage: 'recovery', failureCode: 'source-invalid' }).catch(() => {});
    if (replacementComplete) {
      currentSession.status = 'ready';
      throw new Error(`El video se recuperó, pero no se pudo actualizar su registro: ${error.message}`);
    }
    throw new Error(`No se pudo recuperar este video parcial. El archivo original se conservó: ${error.message}`);
  } finally {
    await fsp.rm(temporaryPath, { force: true }).catch(() => {});
  }
}

async function continueRecovery(id, format, ownerWindow) {
  if (!['webm', 'mp4', 'mkv', 'gif'].includes(format)) throw new Error('El formato de salida seleccionado no está permitido.');
  if (activeSavePromise) throw new Error('Ya se está guardando otra grabación. Inténtalo cuando termine.');
  if (recordingSession) throw new Error('Termina o conserva primero la grabación que está abierta en la ventana principal.');
  const previousProgressOwner = recoverySaveOwner;
  recoverySaveOwner = ownerWindow;
  traySaveStage = 'recovery';
  const operation = (async () => {
    const currentSession = await loadRecoveryRecording(id);
    if (currentSession.status === 'unrecoverable') throw new Error('Esta grabación no se pudo recuperar.');
    recordingSession = currentSession;
    currentSession.status = 'saving';
    try {
      await repairInterruptedRecording(currentSession);
      assertSaveSessionActive(currentSession);
      if (currentSession.hasAudio === null) currentSession.hasAudio = false;
      // Any saved processing state resumes the pipeline from the original video.
      currentSession.status = 'ready';
      const result = await saveRecordingCore(id, format, ownerWindow, currentSession);
      if (result.status === 'cancelled' && recordingSession === currentSession) recordingSession = null;
      return result;
    } catch (error) {
      if (recordingSession === currentSession) recordingSession = null;
      throw error;
    }
  })();
  activeSavePromise = operation;
  refreshTrayMenu();
  try {
    return await operation;
  } finally {
    if (activeSavePromise === operation) activeSavePromise = null;
    recoverySaveOwner = previousProgressOwner;
    traySaveStage = null;
    refreshTrayMenu();
    await notifyRecoverySessionsChanged();
  }
}

async function saveRecording(id, format, ownerWindow = mainWindow, suppliedSession = null) {
  if (activeSavePromise) throw new Error('Ya se está guardando otra grabación. Inténtalo cuando termine.');
  const previousProgressOwner = recoverySaveOwner;
  recoverySaveOwner = ownerWindow;
  const operation = saveRecordingCore(id, format, ownerWindow, suppliedSession);
  activeSavePromise = operation;
  refreshTrayMenu();
  try {
    return await operation;
  } finally {
    if (activeSavePromise === operation) activeSavePromise = null;
    recoverySaveOwner = previousProgressOwner;
    traySaveStage = null;
    refreshTrayMenu();
  }
}

async function saveRecordingCore(id, format, ownerWindow, suppliedSession) {
  const currentSession = suppliedSession || recordingSession;
  if (!currentSession || currentSession.id !== id || currentSession.status !== 'ready') {
    throw new Error('La grabación ya no está disponible para guardar.');
  }
  if (!['webm', 'mp4', 'mkv', 'gif'].includes(format)) throw new Error('El formato de salida seleccionado no está permitido.');

  const label = { webm: 'WebM', mp4: 'MP4', mkv: 'MKV', gif: 'GIF' }[format];
  const sourceName = safeCaptureFileName(currentSession.sourceName);
  const defaultName = `${sourceName}-${new Date().toISOString().replace(/[:.]/g, '-')}.${format}`;
  currentSession.status = 'saving';
  traySaveStage = null;
  refreshTrayMenu();
  let saveDirectory;
  try {
    saveDirectory = await getSaveDirectoryStatus();
  } catch (error) {
    currentSession.status = 'ready';
    throw error;
  }
  let overwriteConfirmed = false;
  let targetPath;
  if (saveDirectory.directory) {
    if (!saveDirectory.available) {
      currentSession.status = 'ready';
      throw new Error('La carpeta predeterminada ya no está disponible. Elige otra en Preferencias / Configuración o restablécela.');
    }
    targetPath = chooseUniqueMediaPath(path.join(saveDirectory.directory, defaultName), (candidate) => fs.existsSync(candidate) || fs.existsSync(getSubtitlePath(candidate)));
  } else {
    const { filePath: chosenPath } = await dialog.showSaveDialog(ownerWindow || mainWindow, {
      defaultPath: path.join(app.getPath('videos'), defaultName),
      filters: [{ name: `${label} (${format.toUpperCase()})`, extensions: [format] }],
      properties: ['showOverwriteConfirmation']
    });
    if (!chosenPath) {
      currentSession.status = 'ready';
      return { status: 'cancelled' };
    }
    targetPath = path.extname(chosenPath).toLowerCase() === `.${format}` ? chosenPath : `${chosenPath}.${format}`;
    overwriteConfirmed = fs.existsSync(targetPath);
  }
  let temporaryOutput = null;
  let temporarySubtitle = null;
  let stage = 'transcription';
  try {
    let subtitlePath = null;
    if (currentSession.hasAudio) {
      await setRecoverySessionState(currentSession, 'transcribing');
      subtitlePath = await ensureSessionTranscript(currentSession);
    }
    assertSaveSessionActive(currentSession);

    if (currentSession.hasAudio && !overwriteConfirmed) targetPath = chooseAvailableMediaPath(targetPath);
    const subtitleTargetPath = currentSession.hasAudio ? getSubtitlePath(targetPath) : null;

    temporaryOutput = path.join(path.dirname(targetPath), `.${path.parse(targetPath).name}-${id}.partial.${format}`);
    currentSession.temporaryOutput = temporaryOutput;
    stage = format === 'webm' ? 'finalizing' : 'conversion';
    await setRecoverySessionState(currentSession, stage === 'conversion' ? 'converting' : 'finalizing');
    if (stage === 'conversion') notifySaveProgress('conversion');
    if (format === 'webm') await fsp.copyFile(currentSession.filePath, temporaryOutput);
    else await runFfmpeg(currentSession.filePath, temporaryOutput, format, currentSession.hasAudio);
    assertSaveSessionActive(currentSession);

    stage = 'finalizing';
    await setRecoverySessionState(currentSession, 'finalizing');
    notifySaveProgress('finalizing');
    if ((await fsp.stat(temporaryOutput)).size === 0) throw new Error('La salida generada está vacía.');
    const outputs = [{ temporaryPath: temporaryOutput, targetPath }];
    if (subtitlePath) {
      temporarySubtitle = path.join(path.dirname(targetPath), `.${path.parse(targetPath).name}-${id}.partial.srt`);
      currentSession.temporarySubtitle = temporarySubtitle;
      await fsp.copyFile(subtitlePath, temporarySubtitle);
      outputs.push({ temporaryPath: temporarySubtitle, targetPath: subtitleTargetPath });
    }
    await commitOutputPair(outputs, currentSession, overwriteConfirmed);
    if (currentSession.recoveryManaged && recoveryStore) {
      await recoveryStore.removeSession(currentSession.id);
    } else {
      await fsp.rm(currentSession.filePath, { force: true }).catch(() => {});
    }
    if (currentSession.subtitleTempPath) await fsp.rm(path.dirname(currentSession.subtitleTempPath), { recursive: true, force: true }).catch(() => {});
    recordingSession = null;
    await notifyRecoverySessionsChanged();
    return { status: 'saved', path: targetPath, subtitlePath: subtitlePath ? subtitleTargetPath : null };
  } catch (error) {
    if (temporaryOutput) await fsp.rm(temporaryOutput, { force: true }).catch(() => {});
    if (temporarySubtitle) await fsp.rm(temporarySubtitle, { force: true }).catch(() => {});
    if (recordingSession === currentSession) {
      currentSession.temporaryOutput = null;
      currentSession.temporarySubtitle = null;
      currentSession.status = 'ready';
      const failureStage = stage === 'transcription' ? 'transcription' : stage === 'conversion' ? 'conversion' : 'finalizing';
      const failureCode = stage === 'transcription'
        ? 'transcription-failed'
        : stage === 'conversion'
          ? 'conversion-failed'
          : 'finalization-failed';
      await setRecoverySessionState(currentSession, 'failed', failureStage, failureCode).catch(() => {});
      currentSession.status = 'ready';
      if (ownerWindow && ownerWindow !== mainWindow) {
        recordingSession = null;
        await notifyRecoverySessionsChanged();
      }
    }
    if (stage === 'transcription') return { status: 'transcription-failed', message: error.message, canSaveWebm: true };
    if (stage === 'conversion') return { status: 'conversion-failed', message: error.message, canSaveWebm: true };
    return { status: 'save-failed', message: error.message, canSaveWebm: true };
  }
}

async function saveImage(input, format, sourceName) {
  if (!['png', 'jpg'].includes(format)) throw new Error('El formato de imagen seleccionado no está permitido.');
  const imageBytes = Buffer.isBuffer(input)
    ? input
    : ArrayBuffer.isView(input)
      ? Buffer.from(input.buffer, input.byteOffset, input.byteLength)
      : input instanceof ArrayBuffer
        ? Buffer.from(input)
        : null;
  if (!imageBytes || imageBytes.length < 4 || imageBytes.length > 100 * 1024 * 1024) {
    throw new Error('La imagen no tiene un tamaño válido.');
  }
  const validPng = format === 'png'
    && imageBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const validJpeg = format === 'jpg' && imageBytes[0] === 0xff && imageBytes[1] === 0xd8;
  if (!validPng && !validJpeg) throw new Error('El contenido de la imagen no coincide con el formato seleccionado.');

  const saveDirectory = await getSaveDirectoryStatus();
  if (!saveDirectory.available) throw new Error('La carpeta de guardado predeterminada no está disponible. Elige otra en Preferencias / Configuración.');
  const captureName = safeCaptureFileName(sourceName);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targetPath = chooseUniqueMediaPath(
    path.join(saveDirectory.directory, `${captureName}-${timestamp}.${format}`),
    (candidate) => fs.existsSync(candidate)
  );
  const temporaryPath = path.join(saveDirectory.directory, `.${path.parse(targetPath).name}-${randomUUID()}.partial.${format}`);
  try {
    await fsp.writeFile(temporaryPath, imageBytes, { flag: 'wx' });
    await fsp.rename(temporaryPath, targetPath);
    return { status: 'saved', path: targetPath };
  } catch (error) {
    await fsp.rm(temporaryPath, { force: true }).catch(() => {});
    throw new Error(`No se pudo guardar la imagen: ${error.message}`);
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
  if (currentSession.recoveryManaged && recoveryStore) {
    await recoveryStore.removeSession(currentSession.id).catch(() => {});
  } else {
    await fsp.rm(currentSession.filePath, { force: true }).catch(() => {});
  }
  if (currentSession.temporaryOutput) await fsp.rm(currentSession.temporaryOutput, { force: true }).catch(() => {});
  if (currentSession.temporarySubtitle) await fsp.rm(currentSession.temporarySubtitle, { force: true }).catch(() => {});
  if (currentSession.subtitleTempPath) await fsp.rm(path.dirname(currentSession.subtitleTempPath), { recursive: true, force: true }).catch(() => {});
}

async function preserveCurrentSession(id, failureCode = 'capture-write-failed') {
  const currentSession = recordingSession;
  if (!currentSession || currentSession.id !== id) return false;
  currentSession.status = 'preserving';
  refreshTrayMenu();
  await currentSession.writeChain.catch(() => {});
  if (currentSession.stream && !currentSession.stream.closed) {
    if (currentSession.writeError) {
      const closed = new Promise((resolve) => currentSession.stream.once('close', resolve));
      currentSession.stream.destroy();
      await closed;
    } else {
      await new Promise((resolve) => {
        currentSession.stream.once('error', resolve);
        currentSession.stream.end(resolve);
      });
    }
  }
  if (currentSession.recoveryManaged && recoveryStore) {
    await recoveryStore.updateSession(id, {
      state: 'interrupted-recording',
      failureStage: 'capture',
      failureCode
    }).catch(() => {});
  }
  recordingSession = null;
  return true;
}

function registerIpcHandlers() {
  registerHandler('get-developer-info', getAppInformation);
  registerHandler('open-about-window', async () => {
    openAboutWindow();
    return { status: 'opened' };
  });
  ipcMain.handle('get-app-info', async (event) => {
    if (!isTrustedAboutRenderer(event)) throw new Error('Solicitud de información rechazada: origen no confiable.');
    return getAppInformation();
  });
  registerHandler('update-tray-capture-state', async (phase, paused) => {
    if (!isValidTrayCaptureState(phase, paused)) throw new Error('El estado de captura no es válido.');
    trayCapturePhase = phase;
    trayCapturePaused = paused;
    refreshTrayMenu();
    return { status: 'updated' };
  });
  registerHandler('get-save-directory', getSaveDirectoryStatus);
  registerHandler('choose-save-directory', chooseSaveDirectory);
  registerHandler('reset-save-directory', resetSaveDirectory);
  registerHandler('get-start-with-windows', async () => ({
    enabled: app.getLoginItemSettings(getLoginItemIdentity()).openAtLogin
  }));
  registerHandler('set-start-with-windows', async (enabled) => {
    if (typeof enabled !== 'boolean') throw new Error('La opción de inicio debe ser verdadera o falsa.');
    app.setLoginItemSettings({ ...getLoginItemIdentity(), openAtLogin: enabled, enabled: true });
    return { enabled: app.getLoginItemSettings(getLoginItemIdentity()).openAtLogin };
  });

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
  registerHandler('get-recovery-sessions-main', getRecoverySummaries);
  registerHandler('open-recovery-window', async () => {
    openRecoveryWindow();
    return { status: 'opened' };
  });
  registerHandler('recording-preserved-for-exit', async (id) => {
    const record = recoveryStore ? await recoveryStore.getSession(id) : null;
    const currentReady = recordingSession?.id === id && recordingSession.status === 'ready';
    const alreadyPreserved = !recordingSession
      && record
      && ['ready', 'interrupted-recording'].includes(record.state);
    if (!currentReady && !alreadyPreserved) {
      throw new Error('La grabación no terminó de prepararse para recuperarla.');
    }
    if (preserveRecordingForExitResolve) {
      if (preserveRecordingForExitTimer) clearTimeout(preserveRecordingForExitTimer);
      preserveRecordingForExitTimer = null;
      const resolve = preserveRecordingForExitResolve;
      preserveRecordingForExitResolve = null;
      resolve(true);
    }
    return { status: 'preserved' };
  });
  registerHandler('set-compact-settings-open', async (expanded, requestedHeight) => {
    if (typeof expanded !== 'boolean') throw new Error('El estado de ajustes compactos no es válido.');
    if (expanded && (!Number.isInteger(requestedHeight) || requestedHeight < 160 || requestedHeight > 1200)) {
      throw new Error('El tamaño solicitado para los ajustes compactos no es válido.');
    }
    return setCompactSettingsExpanded(expanded, requestedHeight);
  });

  registerHandler('get-sources', async () => {
    const sources = await getDesktopSources();
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      displayId: source.display_id,
      thumbnail: source.thumbnail.toDataURL(),
      icon: source.appIcon?.toDataURL() ?? null
    }));
  });

  registerHandler('update-region-highlight', updateRegionOverlay);
  registerHandler('show-selected-source-highlight', showSelectedSourceHighlight);
  registerHandler('show-selected-region-highlight', showSelectedRegionHighlight);
  registerHandler('hide-region-highlight', async () => hideRegionOverlay());
  registerHandler('select-capture-region', selectCaptureRegionOnDesktop);
  ipcMain.on('region-selection-complete', handleDesktopRegionSelection);

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
  registerHandler('clear-capture', async () => {
    selectedCapture = { source: null, systemAudio: false, microphone: false };
    hideRegionOverlay();
    return { systemAudioAvailable: process.platform === 'win32' };
  });

  registerHandler('begin-recording', async (hasAudio) => {
    if (!await getSourceById(selectedCapture.source?.id)) {
      throw new Error('La fuente seleccionada ya no está disponible. Actualiza las fuentes e inténtalo de nuevo.');
    }
    if (typeof hasAudio !== 'boolean') throw new Error('La configuración de audio de la grabación no es válida.');
    return createRecordingSession(hasAudio);
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
      recordingSession.hasAudio = hasAudio;
      await closeRecordingStream(recordingSession);
      recordingSession.status = 'ready';
      recordingSession.recoveryRecord = await recoveryStore.updateSession(id, {
        state: 'ready',
        hasAudio,
        failureStage: null,
        failureCode: null
      });
      refreshTrayMenu();
      return { status: 'ready' };
    } catch (error) {
      await preserveCurrentSession(id, 'capture-write-failed');
      await notifyRecoverySessionsChanged();
      throw new Error(`La captura quedó como archivo recuperable, pero no se pudo finalizar: ${error.message}`);
    }
  });
  registerHandler('save-recording', async (id, format) => saveRecording(id, format, mainWindow));
  registerHandler('save-image', saveImage);
  registerHandler('discard-recording', async (id) => {
    if (!recordingSession || recordingSession.id !== id || recordingSession.status !== 'ready') {
      throw new Error('La grabación pendiente ya no está disponible.');
    }
    await discardCurrentSession();
    await notifyRecoverySessionsChanged();
    return { status: 'discarded' };
  });
  registerHandler('abort-recording', async (id) => {
    if (!recordingSession || recordingSession.id !== id || !['recording', 'ready'].includes(recordingSession.status)) {
      throw new Error('La sesión de grabación ya no está disponible.');
    }
    await preserveCurrentSession(id);
    await notifyRecoverySessionsChanged();
    return { status: 'preserved' };
  });

  registerRecoveryHandler('get-recovery-sessions-window', async () => getRecoverySummaries());
  registerRecoveryHandler('continue-recovery', async (id, format, ownerWindow) => continueRecovery(id, format, ownerWindow));
  registerRecoveryHandler('discard-recovery', async (id) => {
    if (!recoveryStore) throw new Error('El sistema de recuperación todavía no está listo.');
    if (recordingSession?.id === id) throw new Error('No se puede descartar una sesión que está activa.');
    const removed = await recoveryStore.removeSession(id);
    if (!removed) throw new Error('La sesión de recuperación ya no está disponible.');
    await notifyRecoverySessionsChanged();
    return { status: 'discarded' };
  });
}

app.whenReady().then(() => {
  migrateWindowsLoginItem();
  recoveryStore = createRecoveryStore({ userDataPath: app.getPath('userData') });
  Menu.setApplicationMenu(null);
  createTray();
  makeWindow();
  configureCaptureHandler();
  registerIpcHandlers();
  getRecoverySummaries().then((sessions) => refreshTrayMenu(sessions.length)).catch(() => {});
  globalShortcut.register('CommandOrControl+Shift+M', toggleCompactModeFromShortcut);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function cleanupAppForQuit() {
  globalShortcut.unregisterAll();
  if (tray) tray.destroy();
}

async function retainSessionBeforeQuit() {
  const currentSession = recordingSession;
  if (!currentSession) return;
  if (currentSession.status === 'recording') {
    const preserved = await new Promise((resolve) => {
      preserveRecordingForExitResolve = resolve;
      preserveRecordingForExitTimer = setTimeout(() => {
        preserveRecordingForExitTimer = null;
        preserveRecordingForExitResolve = null;
        resolve(false);
      }, 10000);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('preserve-recording-for-exit', currentSession.id);
      } else {
        if (preserveRecordingForExitTimer) clearTimeout(preserveRecordingForExitTimer);
        preserveRecordingForExitTimer = null;
        preserveRecordingForExitResolve = null;
        resolve(false);
      }
    });
    if (!preserved && recordingSession?.id === currentSession.id) {
      await preserveCurrentSession(currentSession.id);
    }
    return;
  }
  if (currentSession.status === 'saving') {
    currentSession.cancelRequested = true;
    if (downloadRequest) {
      downloadRequest.destroy(new Error('El guardado se reanudará desde la recuperación.'));
      downloadRequest = null;
    }
    if (activeChildProcess && !activeChildProcess.killed) activeChildProcess.kill();
    await activeSavePromise?.catch(() => {});
  }
  if (recordingSession === currentSession) recordingSession = null;
}

app.on('before-quit', (event) => {
  if (allowQuitAfterPreservation) {
    cleanupAppForQuit();
    return;
  }
  event.preventDefault();
  if (isPreparingQuit) return;
  isPreparingQuit = true;
  void (async () => {
    try {
      await retainSessionBeforeQuit();
    } catch {
      // Preserve the process exit even if the last recovery metadata write fails.
    } finally {
      cleanupAppForQuit();
      allowQuitAfterPreservation = true;
      app.quit();
    }
  })();
});
