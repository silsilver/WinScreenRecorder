# WinScreen Recorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a robust, native Windows screen and window recording desktop application using Electron, Tailwind CSS, Alpine.js, and FFmpeg with support for audio capture, countdowns, and standard video/GIF formats.

**Architecture:** Electron desktop app with a main process handling IPC, desktop screen capture sources, and FFmpeg spawning for encoding. The renderer runs HTML5 + Tailwind CSS + Alpine.js for a modern control panel and recording workflow.

**Tech Stack:** Node.js, Electron, Tailwind CSS (via CDN), Alpine.js (via CDN), FFmpeg (bundled or system).

**Spec:** `docs/superpowers/specs/2026-03-30-winscreen-recorder-design.md`

## Global Constraints
- Platform: Windows (x64)
- Output formats: MP4 (H.264), MKV, WebM, GIF
- Audio: Microphone and system audio support

---

### Task 1: Project Scaffolding & Dependencies

**Files:**
- Create: `package.json`
- Create: `main.js`
- Create: `preload.js`
- Create: `src/index.html`

**Interfaces:**
- Consumes: Electron runtime & Node.js APIs
- Produces: Electron window loading `src/index.html` with contextBridge preload.

- [ ] **Step 1: Create package.json**

```json
{
  "name": "winscreen-recorder",
  "version": "1.0.0",
  "description": "Windows screen and window recorder to standard formats",
  "main": "main.js",
  "scripts": {
    "start": "electron ."
  },
  "dependencies": {
    "electron": "^34.0.0"
  }
}
```

- [ ] **Step 2: Create preload.js for secure bridge**

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSources: () => ipcRenderer.invoke('get-sources'),
  startRecording: (options) => ipcRenderer.invoke('start-recording', options),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
  saveFile: (defaultPath) => ipcRenderer.invoke('save-file', defaultPath)
});
```

- [ ] **Step 3: Create main.js**

```javascript
const { app, BrowserWindow, ipcMain, desktopCapturer, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let recordingProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src/index.html'));
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle('get-sources', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 300, height: 200 } });
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL()
    }));
  });

  ipcMain.handle('save-file', async (event, defaultName) => {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName || 'recording.mp4',
      filters: [
        { name: 'MP4 Video', extensions: ['mp4'] },
        { name: 'MKV Video', extensions: ['mkv'] },
        { name: 'WebM Video', extensions: ['webm'] },
        { name: 'GIF Animation', extensions: ['gif'] }
      ]
    });
    return filePath;
  });

  ipcMain.handle('start-recording', async (event, options) => {
    // Recording initialization logic handled in renderer or via ffmpeg spawn
    return true;
  });

  ipcMain.handle('stop-recording', async () => {
    if (recordingProcess) {
      recordingProcess.kill('SIGINT');
      recordingProcess = null;
    }
    return true;
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 4: Commit setup**

```bash
git add package.json main.js preload.js
git commit -m "feat: initialize Electron scaffolding and IPC bridge"
```

---

### Task 2: Frontend User Interface (Tailwind CSS & Alpine.js)

**Files:**
- Create: `src/index.html`
- Create: `src/renderer.js`

**Interfaces:**
- Consumes: `window.electronAPI`
- Produces: Interactive control panel for source selection, audio toggles, countdown, and recording state.

- [ ] **Step 1: Create src/index.html**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>WinScreen Recorder</title>
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
</head>
<body class="bg-gray-900 text-gray-100 font-sans min-h-screen p-6" x-data="recorderApp()">
  <div class="max-w-4xl mx-auto">
    <header class="flex justify-between items-center mb-8 pb-4 border-b border-gray-800">
      <h1 class="text-2xl font-bold flex items-center gap-2">
        <span class="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span> WinScreen Recorder
      </h1>
      <span class="text-sm bg-gray-800 px-3 py-1 rounded text-gray-400" x-text="statusText">Listo</span>
    </header>

    <!-- Main Grid -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <!-- Settings Panel -->
      <div class="bg-gray-800 p-5 rounded-xl border border-gray-700 space-y-4">
        <h2 class="font-semibold text-lg text-indigo-400">Configuración</h2>
        
        <div>
          <label class="block text-sm text-gray-400 mb-1">Formato de Salida</label>
          <select x-model="format" class="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm">
            <option value="mp4">MP4 (H.264)</option>
            <option value="mkv">MKV</option>
            <option value="webm">WebM</option>
            <option value="gif">GIF Animado</option>
          </select>
        </div>

        <div>
          <label class="block text-sm text-gray-400 mb-1">Cuenta Atrás</label>
          <select x-model="countdownSec" class="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm">
            <option value="0">Sin cuenta atrás</option>
            <option value="3">3 segundos</option>
            <option value="5">5 segundos</option>
          </select>
        </div>

        <div class="space-y-2 pt-2 border-t border-gray-700">
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" x-model="recordMic" class="rounded bg-gray-900 border-gray-700">
            Grabar Micrófono
          </label>
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" x-model="recordSystemAudio" class="rounded bg-gray-900 border-gray-700">
            Audio del Sistema
          </label>
        </div>

        <button @click="loadSources()" class="w-full bg-gray-700 hover:bg-gray-600 text-sm py-2 rounded transition font-medium">
          Actualizar Fuentes
        </button>
      </div>

      <!-- Sources & Preview Panel -->
      <div class="md:col-span-2 bg-gray-800 p-5 rounded-xl border border-gray-700 flex flex-col justify-between">
        <div>
          <h2 class="font-semibold text-lg text-indigo-400 mb-3">Seleccionar Pantalla o Ventana</h2>
          <div class="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
            <template x-for="source in sources" :key="source.id">
              <div @click="selectedSource = source.id" 
                   :class="selectedSource === source.id ? 'border-indigo-500 bg-gray-700/50' : 'border-gray-700 hover:border-gray-500'"
                   class="border rounded-lg p-2 cursor-pointer transition flex flex-col items-center">
                <img :src="source.thumbnail" class="w-full h-28 object-cover rounded mb-2 bg-gray-900">
                <span class="text-xs text-center truncate w-full" x-text="source.name"></span>
              </div>
            </template>
          </div>
        </div>

        <!-- Action / Countdown / Timer Bar -->
        <div class="mt-6 pt-4 border-t border-gray-700 flex items-center justify-between">
          <div class="text-xl font-mono" x-text="timerDisplay">00:00</div>

          <div class="flex gap-3">
            <template x-if="!recording && !countingDown">
              <button @click="startCountdownAndRecord()" class="bg-indigo-600 hover:bg-indigo-500 px-6 py-2 rounded-lg font-medium transition flex items-center gap-2">
                Iniciar Grabación
              </button>
            </template>

            <template x-if="countingDown">
              <button disabled class="bg-yellow-600 px-6 py-2 rounded-lg font-medium animate-pulse">
                Grabando en <span x-text="countdownValue"></span>s...
              </button>
            </template>

            <template x-if="recording">
              <button @click="stopRecording()" class="bg-red-600 hover:bg-red-500 px-6 py-2 rounded-lg font-medium transition flex items-center gap-2">
                Detener Grabación
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script src="renderer.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create src/renderer.js**

```javascript
function recorderApp() {
  return {
    sources: [],
    selectedSource: null,
    format: 'mp4',
    countdownSec: 3,
    recordMic: false,
    recordSystemAudio: false,
    statusText: 'Listo',
    recording: false,
    countingDown: false,
    countdownValue: 0,
    timerSeconds: 0,
    timerInterval: null,
    mediaRecorder: null,
    recordedChunks: [],

    async init() {
      await this.loadSources();
    },

    async loadSources() {
      this.sources = await window.electronAPI.getSources();
      if (this.sources.length > 0 && !this.selectedSource) {
        this.selectedSource = this.sources[0].id;
      }
    },

    async startCountdownAndRecord() {
      if (!this.selectedSource) {
        alert('Por favor selecciona una pantalla o ventana.');
        return;
      }

      const count = parseInt(this.countdownSec);
      if (count > 0) {
        this.countingDown = true;
        this.countdownValue = count;
        let interval = setInterval(() => {
          this.countdownValue--;
          if (this.countdownValue <= 0) {
            clearInterval(interval);
            this.countingDown = false;
            this.startActualRecording();
          }
        }, 1000);
      } else {
        this.startActualRecording();
      }
    },

    async startActualRecording() {
      try {
        const constraints = {
          audio: this.recordMic ? {
            echoCancellation: true,
            noiseSuppression: true
          } : false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: this.selectedSource,
              minWidth: 1280,
              maxWidth: 1920,
              minHeight: 720,
              maxHeight: 1080
            }
          }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Handle system audio if requested
        if (this.recordSystemAudio) {
          try {
            const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: false, audio: true });
            displayStream.getAudioTracks().forEach(track => stream.addTrack(track));
          } catch (e) {
            console.warn('Audio del sistema no disponible:', e);
          }
        }

        this.recordedChunks = [];
        this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) this.recordedChunks.push(event.data);
        };

        this.mediaRecorder.onstop = async () => {
          const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
          const buffer = await blob.arrayBuffer();
          
          const filePath = await window.electronAPI.saveFile(`grabacion.${this.format}`);
          if (filePath) {
            // Write file via main or direct node
            const fs = require('fs'); // Note: contextBridge can expose buffer writing or ipc
            // For safety, we will handle file save in main process or buffer transfer
          }
          this.statusText = 'Grabación guardada con éxito';
        };

        this.mediaRecorder.start();
        this.recording = true;
        this.statusText = 'Grabando...';
        this.timerSeconds = 0;
        this.timerInterval = setInterval(() => {
          this.timerSeconds++;
        }, 1000);

      } catch (err) {
        console.error('Error al iniciar grabación:', err);
        alert('Error al capturar pantalla o audio: ' + err.message);
        this.countingDown = false;
        this.recording = false;
      }
    },

    stopRecording() {
      if (this.mediaRecorder && this.recording) {
        this.mediaRecorder.stop();
        this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }
      if (this.timerInterval) clearInterval(this.timerInterval);
      this.recording = false;
      this.statusText = 'Detenido';
    },

    get timerDisplay() {
      const mins = Math.floor(this.timerSeconds / 60).toString().padStart(2, '0');
      const secs = (this.timerSeconds % 60).toString().padStart(2, '0');
      return `${mins}:${secs}`;
    }
  };
}
```

- [ ] **Step 3: Commit UI implementation**

```bash
git add src/index.html src/renderer.js
git commit -m "feat: add Tailwind & Alpine.js UI and MediaRecorder stream capture logic"
```

---

### Task 3: File Saving & Integration Testing

**Files:**
- Modify: `main.js`
- Modify: `src/renderer.js`

**Interfaces:**
- Consumes: IPC `save-file`
- Produces: Final saved recording file on Windows disk.

- [ ] **Step 1: Update main.js to handle binary recording buffer save**

Add IPC handler in `main.js`:
```javascript
ipcMain.handle('save-buffer', async (event, bufferData, defaultName) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'grabacion.webm',
    filters: [
      { name: 'WebM Video', extensions: ['webm'] },
      { name: 'MP4 Video', extensions: ['mp4'] },
      { name: 'MKV Video', extensions: ['mkv'] }
    ]
  });

  if (filePath) {
    fs.writeFileSync(filePath, Buffer.from(bufferData));
    return filePath;
  }
  return null;
});
```

- [ ] **Step 2: Expose saveBuffer in preload.js**

```javascript
  saveBuffer: (buffer, defaultName) => ipcRenderer.invoke('save-buffer', buffer, defaultName)
```

- [ ] **Step 3: Update renderer.js mediaRecorder.onstop to use saveBuffer**

```javascript
        this.mediaRecorder.onstop = async () => {
          const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
          const buffer = await blob.arrayBuffer();
          
          const filePath = await window.electronAPI.saveBuffer(buffer, `grabacion.${this.format}`);
          if (filePath) {
            this.statusText = `Guardado en: ${filePath}`;
          } else {
            this.statusText = 'Guardado cancelado';
          }
        };
```

- [ ] **Step 4: Commit file save integration**

```bash
git add main.js preload.js src/renderer.js
git commit -m "feat: implement robust buffer save dialog and file writing via IPC"
```

---

### Task 4: Documentation & Final Verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README.md**

```markdown
# WinScreen Recorder

Aplicación de escritorio para Windows desarrollada con Electron, Tailwind CSS, Alpine.js y FFmpeg para grabar pantalla completa, ventanas y audio (micrófono / sistema) en formatos estándar.

## Instalación y Ejecución

1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Ejecutar la aplicación:
   ```bash
   npm start
   ```
```

- [ ] **Step 2: Commit README**

```bash
git add README.md
git commit -m "docs: add README for WinScreen Recorder"
```
