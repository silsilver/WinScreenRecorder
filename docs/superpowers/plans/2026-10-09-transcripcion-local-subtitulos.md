# Transcripción local y subtítulos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Inline execution is used in this session; do not delegate because the active workspace instructions prohibit spawning agents unless explicitly requested.

**Goal:** Generate a local Spanish-capable timestamped SRT as a required companion whenever a recording containing audio is saved.

**Architecture:** The Electron main process obtains a pinned whisper.cpp Windows x64 runtime and a pinned multilingual quantized model, verifies checksums, extracts audio through the existing FFmpeg binary, and writes the transcript as SRT beside the selected output. IPC progress events update the renderer; source and destination files use unique temporary names and atomic finalization.

**Tech Stack:** Electron 44, Node.js built-ins, pinned whisper.cpp release b5454, Whisper base q5_1 model, existing FFmpeg, SRT.

**Spec:** `docs/superpowers/specs/2026-10-09-transcripcion-local-subtitulos-design.md`

## Global Constraints

- Recognition runs locally; captured audio is never uploaded.
- Transcription is automatic and required for every save path when audio exists, including WebM fallback; captures without audio save without SRT.
- Keep the model outside the installer and download it once into user data, verifying SHA-256 before use.
- Store SRT alongside the media using the same basename; never leave a partially written final output after a reported failure.
- Keep existing captures available after conversion or transcription failure.
- IPC remains limited to the trusted local renderer; the main process owns paths and child-process arguments.

---

### Task 1: Bundle a verified local transcription runtime

**Files:**
- Modify: `package.json`
- Create: `scripts/prepare-whisper.ps1`
- Create: `vendor/whisper/WHISPER-PROVENANCE.txt`
- Create: `LICENSES/whisper.cpp.txt`
- Modify: `main.js`

**Interfaces:**
- Build preparation downloads only the official `ggml-org/whisper.cpp` release `b5454`, asset `whisper-bin-x64.zip`, verifies SHA-256 `6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb`, and installs the CLI plus required DLLs in `vendor/whisper`.
- Runtime path resolves to `process.resourcesPath/whisper` when packaged and `vendor/whisper` in development.

- [x] Inventory official ZIP contents and identify the CLI executable, runtime DLLs, and MIT notice; install only required runtime files and notices.
- [x] Add a PowerShell preparation script with pinned URL/hash, atomic extraction, path checks, checksum validation, and idempotent behavior.
- [x] Run that script from `prepare:whisper` and from `start`/`dist:win`; package `vendor/whisper` outside ASAR and include the notice.
- [x] Add main-process helpers to resolve the CLI, download the pinned model atomically to `app.getPath('userData')/models`, verify SHA-256 `422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898`, and remove incomplete downloads.

### Task 2: Transcribe and save the paired SRT safely

**Files:**
- Modify: `main.js`
- Modify: `preload.js`

**Interfaces:**
- `saveRecording(id, format)` uses existing save dialog, then for audio captures prepares the model, extracts mono 16 kHz PCM WAV, invokes whisper CLI with fixed arguments and automatic language detection, converts timestamped segments to SRT, and finalizes media plus `<basename>.srt`.
- Preload exposes `onSaveProgress(callback)` and `removeSaveProgressListener(callback)`; progress payload is limited to a small fixed set of stage labels.

- [x] Add child-process handling for model download, FFmpeg extraction, and whisper CLI with bounded stderr, abort/error handling, fixed executable paths, and no shell.
- [x] Parse CLI SRT output in a unique temporary directory; allow an empty SRT when no speech is detected, and validate sequence and timestamp syntax for nonempty output before committing.
- [x] Ensure duplicate SRT paths are handled without destroying an existing caption file; choose a consistent conflict-safe basename before finalizing media.
- [x] Save both outputs to unique partial paths, preserve old targets until all work succeeds, and roll back new output if finalization fails.
- [x] On success, remove raw WebM and temporary WAV/SRT files but retain the validated model for offline reuse; on failure, retain raw WebM and clean partial files.
- [x] Handle no-audio saves without model download or SRT; every audio save, including WebM fallback, requires a valid SRT.

### Task 3: Present progress and update user documentation

**Files:**
- Modify: `preload.js`
- Modify: `src/renderer.js`
- Modify: `src/index.html`
- Modify: `src/styles.css`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-10-09-transcripcion-local-subtitulos-design.md`

**Interfaces:**
- Main sends `model-download`, `audio-preparation`, `transcription`, and `finalizing` stages over an event scoped to the trusted renderer.
- Renderer renders Spanish status text and treats success as video plus SRT when audio was captured.

- [x] Add a status line under save actions without exposing arbitrary paths or raw process logs.
- [x] Keep all save controls disabled while work runs; show stage updates and useful retry errors, retaining original WebM after failures.
- [x] Document first-use model download, approximately 57 MiB size, offline reuse, SRT pairing, privacy, supported outputs, and retry behavior.
- [x] Update the spec with implementation-specific pinning and actual path-conflict behavior.
- [x] Manually review changed code paths for IPC trust, fixed child-process arguments, checksum enforcement, sidecar pairing, and cleanup behavior. Do not add or run automated tests in this task unless the user asks.


