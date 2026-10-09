# WinScreen Recorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a secure Windows Electron recorder that saves working WebM, MP4, MKV, and GIF captures and can be packaged as an installer.

**Architecture:** Electron main owns capture-source selection, IPC validation, save dialogs, file writes, and FFmpeg conversion. The renderer requests approved media streams, records WebM, and reports user-visible states. All UI libraries and FFmpeg ship locally with a Windows NSIS build.

**Tech Stack:** Node.js, Electron 44, Chromium MediaRecorder, pinned BtbN FFmpeg Windows x64 LGPL build, vanilla JavaScript and CSS, electron-builder NSIS.

**Spec:** `docs/superpowers/specs/2026-10-09-winscreen-recorder-implementation-design.md`

## Global Constraints

- Platform: Windows (x64).
- Capture output: WebM; export formats: MP4, MKV, WebM, GIF.
- System loopback audio uses Electron's display-media handler and is Windows-only.
- Do not claim an export succeeded until the destination file is finalized.
- Do not execute remote scripts or expose raw IPC APIs to the renderer.
- Do not promise signing or publication without user-owned credentials.

---

### Task 1: Secure local UI and current Electron runtime

**Files:**
- Modify: `package.json`
- Create: `package-lock.json`
- Create: `.gitignore`
- Create: `src/styles.css`
- Modify: `src/index.html`
- Modify: `main.js`
- Modify: `preload.js`
- Modify: `src/renderer.js`

**Interfaces:**
- The renderer uses only local HTML/CSS/scripts and an explicit `window.electronAPI` bridge.
- The main process serves only the app's local page and denies unexpected navigation/window creation.

- [ ] Move Electron to supported stable major v44 and add Alpine-free vanilla renderer scripts.
- [ ] Replace CDN Tailwind/Alpine and Alpine inline directives with semantic elements and local CSS/JS.
- [ ] Add a restrictive CSP, `sandbox: true`, `contextIsolation: true`, and `nodeIntegration: false`.
- [ ] Replace unused IPC handlers with narrow functions; verify `event.sender` is the main window and validate all arguments.
- [ ] Add `.gitignore` for `node_modules/`, `dist/`, and debug logs; generate a lockfile.
- [ ] Verify HTML has no external runtime resources, inline scripts, or inline event handlers.

### Task 2: Complete capture, countdown, audio, and save lifecycle

**Files:**
- Modify: `main.js`
- Modify: `preload.js`
- Modify: `src/renderer.js`
- Modify: `src/index.html`
- Modify: `src/styles.css`

**Interfaces:**
- `getSources(): Promise<Source[]>`
- `selectSource(sourceId: string): Promise<void>`
- `saveRecording(buffer: ArrayBuffer, format: 'webm'|'mp4'|'mkv'|'gif'): Promise<{path: string|null}>`
- `window.electronAPI` exposes only these methods and fixed-status callbacks if needed.

- [ ] Main caches valid desktop sources and maps selected IDs to source objects.
- [ ] Install `setDisplayMediaRequestHandler` to grant only the selected source; use `audio: 'loopback'` when Windows system audio is requested.
- [ ] Request `getDisplayMedia` directly from the start button so Chromium receives a user gesture; acquire microphone separately when enabled.
- [ ] Start the countdown after successful stream acquisition; add a cancel action that closes all tracks.
- [ ] Combine selected audio tracks in MediaRecorder, negotiate a supported WebM MIME type, and record in chunks to bound memory use where practical.
- [ ] Handle user stop, track-ended, capture error, dialog cancel, and window close through one idempotent cleanup path.
- [ ] Write WebM asynchronously in main; distinguish save cancel, success, and failure and retain the recording data until save completes.
- [ ] Keep settings and source controls disabled while capture/save/conversion is active.

### Task 3: Convert formats and bundle FFmpeg

**Files:**
- Modify: `package.json`
- Modify: `main.js`
- Modify: `src/index.html`
- Modify: `src/renderer.js`
- Create: `LICENSES/FFmpeg.txt`

**Interfaces:**
- Main `saveRecording(buffer, format)` saves WebM directly or converts to the requested format using a child process and a temporary source file.
- Conversion arguments are built from fixed codec/container presets; no renderer-provided command line or output path is passed to a shell.

- [ ] Add a Windows x64 FFmpeg binary dependency and resolve its dev and packaged paths without launching a shell.
- [ ] Implement MP4 using H.264/AAC when audio exists, MKV using H.264/AAC, and GIF using an FFmpeg palette-generation filter.
- [ ] Convert to a temporary output in the target directory, verify exit status and nonzero file size, then rename atomically to the selected path.
- [ ] On conversion failure, preserve and offer the intermediate WebM rather than labeling it with the selected extension.
- [x] Add the FFmpeg, OpenH264, and GCC notices/license text matching the binary distribution and include the executable outside ASAR in the Windows package.
- [ ] Enable a system-audio option only when loopback is available; report a missing audio track clearly.

### Task 4: Windows installer and usage documentation

**Files:**
- Modify: `package.json`
- Create: `electron-builder.yml`
- Create: `README.md`
- Modify: `docs/superpowers/specs/2026-10-09-winscreen-recorder-implementation-design.md`

**Interfaces:**
- `npm start` runs in development.
- `npm run dist:win` creates a Windows x64 NSIS installer in `dist/`.

- [ ] Configure explicit app ID, product name, x64 NSIS target, ASAR, FFmpeg extra resource, and development/output exclusions.
- [ ] Document install, development run, Windows installer build, supported formats/audio, and current signing status.
- [ ] Update the design document with verified Electron 44 display-media loopback behavior and final implementation boundaries.

### Task 5: Verification

**Files:**
- Verify: application runtime and built installer.

- [ ] Install dependencies from the lockfile and run syntax checks for all JavaScript.
- [ ] Run the packaged app and verify source selection, countdown cancel, short WebM save, format conversion, dialog cancel, and recoverable conversion error.
- [ ] Confirm MP4/MKV/GIF output with the bundled FFmpeg and inspect the files with FFprobe.
- [ ] Verify microphone and Windows loopback tracks separately and together where hardware permits; report unavailable physical-device checks.
- [ ] Build the x64 installer and verify the embedded FFmpeg path works without a system FFmpeg installation.
- [ ] Inspect packaged files and browser console for remote resources, CSP violations, and insecure Electron warnings.

