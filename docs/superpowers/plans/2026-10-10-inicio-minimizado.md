# Inicio oculto en la bandeja con Windows Implementation Plan

> **For agentic workers:** Execute inline, one task at a time. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the main window hidden in the system tray only when WinScreen Recorder is launched by its Windows login item.

**Architecture:** Register a private command-line marker with the existing Electron login item and detect that marker in the main process. Keep the executable path stable, migrate any existing unmarked login entry, and hide from the existing `ready-to-show` handler. The existing tray icon remains available to restore the window.

**Tech Stack:** Electron 44, Node.js main process, Windows login item settings.

**Spec:** `docs/superpowers/specs/2026-10-10-inicio-minimizado-design.md`

## Global Constraints

- Manual launches continue to show the main window.
- Automatic startup hides the window; the tray remains available to restore it.
- Keep the existing executable path and support registrations created before this change.
- Do not change capture, close-to-tray, or compact-mode behavior.

---

### Task 1: Mark automatic launches and hide the main window

**Files:**
- Modify: `main.js`
- Modify: `docs/superpowers/specs/2026-10-10-inicio-minimizado-design.md`

**Interfaces:**
- `WINDOWS_STARTUP_ARGUMENT`: the shared `--started-from-windows` argument used by registration and launch detection.
- `getLoginItemIdentity()`: returns the current executable path and login arguments, including the marker on Windows.
- `migrateWindowsLoginItem()`: converts an existing login registration from the old argument list to the marked one.

- [x] **Step 1: Define the Windows launch marker and preserve legacy identity**

```js
const WINDOWS_STARTUP_ARGUMENT = '--started-from-windows';
const legacyArgs = app.isPackaged ? [] : [app.getAppPath()];
```

Keep `getLoginItemIdentity()` based on `process.execPath` and the existing development app-path argument, adding the marker only on Windows. Add a helper that returns the prior argument list without the marker.

- [x] **Step 2: Migrate any prior enabled login item before creating the window**

On Windows, query `app.getLoginItemSettings()` with the legacy identity. If `openAtLogin` is true, re-register the same executable path with `getLoginItemIdentity()`, `openAtLogin: true`, and `enabled: true`. Leave other platforms and disabled entries untouched.

- [x] **Step 3: Hide only launches carrying the marker**

```js
const startedFromWindowsLogin = process.platform === 'win32'
  && process.argv.includes(WINDOWS_STARTUP_ARGUMENT);
```

In the current `ready-to-show` handler, call `mainWindow.hide()` when this is true and `mainWindow.show()` otherwise.

- [x] **Step 4: Keep the preference query and update aligned with the new identity**

Use `getLoginItemIdentity()` for both the existing `get-start-with-windows` query and `set-start-with-windows` registration and response query.

- [x] **Step 5: Update the spec for the legacy migration detail**

Document that existing enabled login entries are migrated to the marked argument while retaining their executable path.

- [x] **Step 6: Review the diff and commit the implementation**

Review `main.js` and the spec for unintended changes, run `git diff --check`, then commit the plan, spec update, and implementation as one focused change. Do not run project tests unless the user asks for verification.
