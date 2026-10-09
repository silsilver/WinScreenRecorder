# Design Specification: WinScreen Recorder (Windows Screen & Window Recording App)

## Overview
WinScreen Recorder is a native desktop application for Windows built with **Electron**, **Tailwind CSS**, **Alpine.js**, and powered by **FFmpeg**. It allows users to record their entire screen, specific displays, or individual application windows, along with microphone and/or system audio, with a customizable countdown and export to standard formats (`.mp4`, `.mkv`, `.webm`, `.gif`).

## Architecture

```text
winscreen-recorder/
├── package.json
├── main.js                  # Electron main process (IPC handlers, desktopCapturer, ffmpeg runner)
├── preload.js               # Secure context bridge
└── src/
    ├── index.html           # Tailwind CSS + Alpine.js UI
    ├── renderer.js          # UI state, countdown, media selection, recorder bridge
    └── styles.css           # Custom styles
```

## Key Features & Requirements
1. **Source Selection**: List available screens and windows with thumbnail previews using Electron's `desktopCapturer`.
2. **Audio Sources**: Toggle microphone and system audio capture.
3. **Countdown**: Configurable countdown (3s, 5s, 10s) before recording starts.
4. **Standard Formats**: Export to MP4 (H.264/AAC), MKV, WebM, and GIF.
5. **Recording Controls**: Start, Pause, Resume, Stop, and save dialog integration.

## Error Handling & Robustness
- Graceful fallback if FFmpeg path is missing or audio device permissions are denied.
- Safe IPC communication through `contextBridge`.
