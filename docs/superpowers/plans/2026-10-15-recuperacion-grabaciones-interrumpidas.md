# Recuperación de grabaciones interrumpidas — Plan de implementación

**Estado de ejecución (2026-10-15):** Implementación completada. La revisión de sintaxis y las 18 pruebas automatizadas pasan. Queda pendiente la comprobación interactiva con una captura real interrumpida durante grabación y transcripción; las pruebas del almacén no sustituyen esa comprobación.

> **For agentic workers:** Implement this plan inline in the current feature branch; do not delegate.

**Goal:** Conservar grabaciones incompletas y permitir recuperarlas o reintentar su guardado desde una ventana independiente.

**Architecture:** Cada sesión escribe su WebM bajo `Recuperación` dentro de la carpeta de videos activa y conserva su manifiesto en los datos de usuario de la aplicación. Un módulo Node valida y administra sesiones; el proceso principal conserva propiedad de rutas, recuperación, IPC y ventanas. La ventana principal muestra el aviso y una ventana Electron separada lista, reintenta y descarta sesiones.

**Tech Stack:** Electron 44, Node.js integrado, HTML/CSS/JavaScript, FFmpeg ya incluido y whisper.cpp local.

**Spec:** `docs/superpowers/specs/2026-10-15-recuperacion-grabaciones-interrumpidas-design.md`

## Global Constraints

- Cada captura usa un UUID y un archivo nuevo; no anexar datos a sesiones anteriores.
- Guardar el original en `<carpeta de videos activa>/Recuperación`; usar `Videos/WinScreenRecorder/Recuperación` por defecto.
- El proceso principal controla y valida todas las rutas; el renderer pasa solo identificadores y acciones acotadas.
- No borrar originales/manifiestos salvo tras salida completa o descarte explícito.
- La captura y transcripción permanecen locales; no subir audio ni texto.
- Reintentar transcripción desde el original; no prometer continuar desde el punto exacto de interrupción.
- Tratar WebM interrumpidos como recuperación de mejor esfuerzo y mostrar claramente si no son recuperables.
- Conservar estados y archivos de sesiones anteriores aunque una ruta ya no esté disponible; informar el problema sin borrar datos.

---

### Task 1: Crear el almacén persistente de sesiones de recuperación

**Files:**
- Create: `src/recording-recovery.js`
- Create: `test/recording-recovery.test.js`

**Interfaces:**
- `createRecoveryStore({ userDataPath })` returns `createSession({ id, videoDirectory, sourceName, startedAt })`, `updateSession(id, changes)`, `getSession(id)`, `listSessions()`, and `removeSession(id)`.
- A session record contains `id`, `videoDirectory`, `recoveryDirectory`, `mediaFileName`, `sourceName`, `startedAt`, `hasAudio`, `failureStage`, and one of `recording | interrupted-recording | ready | transcribing | converting | finalizing | failed | unrecoverable`.
- `listSessions()` returns safe summaries only; absolute paths stay in the main process. `removeSession(id)` removes only that validated session's media and manifest.
- `mediaPath` is derived only in the main process as `path.join(recoveryDirectory, mediaFileName)`; reject non-UUID identifiers, unsafe basenames, unknown states, and paths that escape `recoveryDirectory`.
- Store JSON manifests under `<userDataPath>/recording-recovery/<id>.json`; atomically replace each manifest through a unique sibling partial file and rename.

- [ ] **Step 1: Define allowed states and input validation.** Add constants for the state enum, UUID check, safe basename check, and a helper that confirms `path.dirname(path.resolve(mediaPath)) === path.resolve(recoveryDirectory)`.
- [ ] **Step 2: Implement atomic manifest writes.** Use `fs/promises` to create the metadata directory, write UTF-8 JSON to a unique `.partial` sibling, and rename it to the stable manifest path. On failure, remove only that partial file and rethrow.
- [ ] **Step 3: Implement create, read, list, update, and remove operations.** List only valid manifests; include valid records with missing/empty media so the UI can label them unavailable. A malformed manifest must not cause arbitrary file access or deletion. Store a fixed failure stage separately from the status; do not persist raw process logs.
- [ ] **Step 4: Review path construction and state transitions against the spec.** Confirm every media operation derives its path in this module from a validated record and that manifest changes are atomic.
- [ ] **Step 5: Add focused store tests.** Use Node's built-in `node:test` and a unique OS temporary directory; test create/list/update/remove, restart persistence, missing media, invalid UUID, and traversal rejection.

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createRecoveryStore } = require('../src/recording-recovery');

test('rejects a manifest media filename that escapes its recovery directory', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'winscreen-recovery-'));
  try {
    const store = createRecoveryStore({ userDataPath: root });
    const record = await store.createSession({
      id: randomUUID(),
      videoDirectory: path.join(root, 'Videos'),
      sourceName: 'Desktop',
      startedAt: Date.now()
    });
    const manifestPath = path.join(root, 'recording-recovery', `${record.id}.json`);
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    manifest.mediaFileName = '..\\outside.webm';
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    await assert.rejects(store.getSession(record.id), /ruta/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 6: Run the focused store tests.** Run `node --test test/recording-recovery.test.js`; expect all store cases to pass and no temporary files to remain after teardown.

### Task 2: Persist capture and save lifecycle in the main process

**Files:**
- Modify: `main.js`
- Modify: `preload.js`

**Interfaces:**
- `begin-recording` creates a new store record and opens its media stream at the record's recovery path before accepting chunks.
- Existing `append-recording-chunk(id, chunk)` continues to append only to the active UUID.
- Add trusted-main-window IPC methods `list-recovery-sessions()`, `continue-recovery(id, format)`, and `discard-recovery(id)`; no IPC method accepts a filesystem path.
- Return recovery summaries containing only ID, display name, date, status, file size, and safe error stage; never return absolute paths to either renderer.
- Save progress is sent to the WebContents that initiated recovery, while existing main-window save progress keeps working.
- The retry handler validates the requested format and passes the recovery window as the parent for any existing save dialog.
- `requestAppExit()` and `before-quit` preserve rather than delete the pending original; explicit deletion remains a user action in the recovery window.

- [ ] **Step 1: Initialize the recovery store after Electron is ready.** Resolve `userDataPath` and the active video directory in the main process; use the current default `Videos/WinScreenRecorder` when no custom directory is set.
- [ ] **Step 2: Create a unique recovery media file and manifest before recording.** Create the `Recuperación` directory, create the file with exclusive mode, and persist `recording` before returning the UUID to the renderer. If persistence fails, close and remove only this newly created file and report a user-readable error.
- [ ] **Step 3: Persist capture completion and actual audio metadata.** After the queued chunks are drained and the stream is ended, update the manifest with `hasAudio` and `ready`. Change the renderer's `chunkError` and `handleCaptureError` paths so an interrupted session is retained as `interrupted-recording`; do not route capture failures through `discardRecording`.
- [ ] **Step 4: Persist save stages and recoverable failures.** Before transcription, conversion, and finalization, write the matching state; on caught failures retain the original and mark `failed` with a fixed stage label and safe error summary. On success, remove the original and manifest only after all output files commit.
- [ ] **Step 5: Rehydrate a selected session for retry.** Load by UUID from the store, verify its media exists, reconstruct the save-session fields from the manifest, and route it through the existing `saveRecording` pipeline. Keep only one active save operation at a time.
- [ ] **Step 6: Preserve a current session on orderly exit.** Update the exit prompt to offer “Salir y conservar para recuperar”. The main process sends `preserve-recording-for-exit`; the renderer stops MediaRecorder, drains `chunkQueue`, calls `completeRecording`, skips automatic save, and acknowledges preservation. On OS-driven quit without this handshake, make `before-quit` prevent exit until queued main-process writes are drained, the stream is closed, and the manifest remains recoverable. Never delete the original on exit.
- [ ] **Step 7: Recover interrupted WebM files.** For `recording` or `interrupted-recording` records, use the bundled FFmpeg with fixed arguments to probe and remux the source into a unique temporary WebM in the same recovery directory. Replace the source only if FFmpeg exits successfully and the output is nonempty; otherwise mark `unrecoverable` and retain the source for explicit discard.
- [ ] **Step 8: Expose narrowly scoped preload methods.** Add only list, continue with one of the existing output formats, discard, preserve-on-exit acknowledgment, and recovery-progress subscription methods; keep save destination selection inside the main process.
- [ ] **Step 9: Exercise lifecycle persistence tests.** Extend the recovery store tests to verify interrupted states remain listed after creating a fresh store instance, and that successful completion removes the original and manifest only after output commit.
- [ ] **Step 10: Run the focused recovery tests.** Run `node --test test/recording-recovery.test.js`; expect durable states to survive reinitialization and cleanup to happen only on success or explicit discard.

### Task 3: Add the recovery window and prominent entry point

**Files:**
- Modify: `main.js`
- Modify: `preload.js`
- Modify: `src/index.html`
- Modify: `src/renderer.js`
- Modify: `src/styles.css`
- Modify: `package.json`
- Create: `src/recovery.html`
- Create: `src/recovery.js`
- Create: `src/recovery.css`
- Create: `src/recovery-preload.js`

**Interfaces:**
- The main window displays a count and button such as `Hay grabaciones por recuperar — Revisar` only when the trusted recovery list has entries.
- Clicking it calls a main-process window action that opens or focuses a single `BrowserWindow` for `src/recovery.html`.
- The recovery window uses context isolation, sandboxing, a dedicated preload, a strict local-file navigation policy, and an IPC allowlist tied to its own WebContents.
- The list shows date, status, and safe source label; each row offers only actions supported by that state.

- [ ] **Step 1: Add the hidden recovery notice to the main window.** Use a semantic button with visible label and an accessible count; add a matching style that stands out within the current palette without relying on color alone.
- [ ] **Step 2: Refresh the notice on load and when the window is restored.** Request the session count from the main process after renderer initialization and whenever the main window becomes visible; hide the notice at zero. Add a recovery entry to the tray menu when the app starts hidden with pending sessions.
- [ ] **Step 3: Create the independent recovery BrowserWindow.** Reuse the app icon and frame conventions, set `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, load only the local HTML file, and focus the existing recovery window instead of opening duplicates.
- [ ] **Step 4: Add a dedicated safe preload and handler guard.** Verify sender WebContents and exact local recovery page URL before list, continue, discard, or progress IPC; never accept a path from the page.
- [ ] **Step 5: Build accessible loading, empty, error, and session-list states.** Render text with DOM text APIs, format dates locally, label each action, and disable row controls while that session is processing.
- [ ] **Step 6: Connect retry and discard actions.** Retry uses the selected UUID and chosen existing output format flow; discard asks for confirmation showing the session label, then refreshes both the list and main-window count.
- [ ] **Step 7: Route progress and completion to the recovery window.** Show model download, audio preparation, transcription, conversion, and finalization status; on completion remove the row and announce the saved output location.
- [ ] **Step 8: Include new source files in syntax checks.** Add `src/recording-recovery.js`, `src/recovery-preload.js`, and `src/recovery.js` to the existing `npm run check` script.
- [ ] **Step 9: Check the window interaction manually.** Launch the app, confirm the alert is absent with no sessions, add a recoverable session, and confirm the alert opens one recovery window with keyboard-operable retry and discard controls.

### Task 4: Document user-facing behavior and review the integrated changes

**Files:**
- Modify: `README.md`
- Review: `docs/superpowers/specs/2026-10-15-recuperacion-grabaciones-interrumpidas-design.md`

**Interfaces:**
- README explains the recovery subfolder, the visible recovery button/window, retry-from-start transcription, best-effort partial WebM repair, and explicit discard.
- Final review traces session IDs and state transitions from capture chunks through output commit and cleanup.

- [ ] **Step 1: Add a concise “Recuperar grabaciones” section to README.** State the default path, custom-folder behavior, what each recovery state means, the limits of interrupted WebM repair, and that incomplete sessions remain until saved or discarded.
- [ ] **Step 2: Review the full success and failure paths.** Confirm that existing destination conflicts still use current safe naming/rollback behavior; transcription retries reuse an existing validated SRT only when it belongs to the same source; no failure removes a recoverable original.
- [ ] **Step 3: Review security boundaries and user-facing strings.** Confirm both windows have exact origin checks, no renderer-supplied paths, escaped text rendering, visible keyboard-accessible actions, and accurate “not recoverable” messaging.
- [ ] **Step 4: Run project checks and report their exact results.** Run `npm run check` and `npm test`; then manually interrupt a recording, restart the app, recover it, and repeat with an interruption during transcription. Report any Windows or media limitation if an interrupted WebM cannot be remuxed.
