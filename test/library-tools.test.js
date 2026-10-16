'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createCaptureHistory } = require('../src/capture-history');
const { validateClip, trimSrt } = require('../src/clip-tools');
const { normalizeBinding, resolveShortcuts } = require('../src/shortcut-settings');
const { shortcuts, findShortcut, setGlobalShortcuts } = require('../src/keyboard-shortcuts');
const { limitMilliseconds, watchCaptureTracks } = require('../src/recording-controls');
const { createLibraryService } = require('../src/library-service');
const vm = require('node:vm');

test('tray exit cancels and awaits an active clip before allowing application quit', async () => {
  const source = await fs.readFile(path.join(__dirname, '../main.js'), 'utf8');
  const extract = (name, next) => source.slice(source.indexOf(`async function ${name}(`), source.indexOf(next, source.indexOf(`async function ${name}(`)));
  const events = [];
  let complete;
  const context = vm.createContext({
    closePromptOpen: false, recordingSession: null, activeCancellation: { cancelled: false }, allowWindowClose: false, allowQuitAfterPreservation: false,
    activeSavePromise: new Promise((resolve) => { complete = resolve; }),
    activeChildProcess: { killed: false, kill() { events.push('cancel'); } },
    app: { quit() { events.push('quit'); } }, dialog: { showErrorBox() { assert.fail('Unexpected exit error'); } }
  });
  vm.runInContext(extract('requestAppExit', '\nfunction configureCaptureHandler') + '\n' + extract('retainSessionBeforeQuit', "\napp.on('before-quit'"), context);
  const exiting = context.requestAppExit();
  await Promise.resolve();
  assert.deepEqual(events, ['cancel']);
  assert.equal(context.allowQuitAfterPreservation, false);
  assert.equal(context.activeCancellation.cancelled, true);
  complete(); await exiting;
  assert.deepEqual(events, ['cancel', 'quit']);
  assert.equal(context.allowQuitAfterPreservation, true);
});

test('history persists, updates a subtitle retry, bounds entries and forgets without deleting media', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'winscreen-history-'));
  try {
    const store = createCaptureHistory(root);
    const media = path.join(root, 'capture.mp4'); await fs.writeFile(media, 'video');
    const first = await store.add({ path: media, name: 'Captura', hasAudio: true });
    const retry = await store.add({ path: media, name: 'Captura', subtitlePath: path.join(root, 'capture.srt') });
    assert.equal(first.id, retry.id);
    await store.rename(first.id, 'Sesión de trabajo');
    await store.add({ path: media, name: 'Nombre automático', durationMs: 3000 });
    assert.equal((await createCaptureHistory(root).list())[0].name, 'Sesión de trabajo');
    assert.equal((await store.get(first.id)).path, media);
    assert.throws(() => store.rename(first.id, '  '));
    assert.throws(() => store.rename(first.id, 'a\ncontrol'));
    assert.equal((await createCaptureHistory(root).list()).length, 1);
    await Promise.all(Array.from({ length: 105 }, (_, index) => store.add({ path: path.join(root, `capture-${index}.mp4`) })));
    assert.equal((await store.list()).length, 100);
    await store.forget(first.id);
    assert.equal(await fs.readFile(media, 'utf8'), 'video');
    await fs.writeFile(path.join(root, 'capture-history.json'), 'damaged');
    await assert.rejects(store.add({ path: media }), /historial/);
    assert.equal(await fs.readFile(path.join(root, 'capture-history.json'), 'utf8'), 'damaged');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('library metadata formats unknown values and sorting does not mutate history', () => {
  const { formatSize, formatDuration, sortRecords } = require('../src/library-presentation');
  assert.match(formatSize(null), /no disponible/);
  assert.equal(formatSize(1024), '1 KiB'); assert.equal(formatDuration(3661000), '1:01:01');
  const records = [{ id: 'a', name: 'Zeta', sizeBytes: 20 }, { id: 'b', name: 'Alfa', sizeBytes: 10 }];
  assert.equal(sortRecords(records, 'name')[0].id, 'b');
  assert.equal(sortRecords(records, 'size')[0].id, 'a');
  assert.equal(records[0].id, 'a');
});
test('clip validation rejects reversed and out of bounds times; SRT clips and shifts correctly', () => {
  assert.equal(validateClip(1, 3, 5000).durationMs, 2000);
  for (const args of [[3, 1, 5000], [-1, 3, 5000], [1, 6, 5000], [1, Infinity, null]]) assert.throws(() => validateClip(...args));
  const result = trimSrt('1\n00:00:00,000 --> 00:00:02,000\nInicio\n\n2\n00:00:03,000 --> 00:00:05,000\nFinal\n', 1, 4);
  assert.equal(result, '1\n00:00:00,000 --> 00:00:01,000\nInicio\n\n2\n00:00:02,000 --> 00:00:03,000\nFinal\n');
  assert.equal(trimSrt('', 0, 1), '');
  assert.throws(() => trimSrt('invalid', 0, 1));
});
test('custom shortcuts validate duplicates and update local fallback including Alt', () => {
  assert.equal(normalizeBinding('ctrl + alt + p').accelerator, 'CommandOrControl+Alt+P');
  assert.throws(() => normalizeBinding('Alt+F4'));
  assert.throws(() => resolveShortcuts(shortcuts, { 'capture-start': 'Ctrl+P', 'capture-stop': 'Ctrl+P' }));
  const resolved = resolveShortcuts(shortcuts, { 'capture-pause': 'Ctrl+Alt+P' });
  setGlobalShortcuts(resolved);
  try {
    assert.equal(findShortcut({ key: 'p', ctrlKey: true, altKey: true }).action, 'capture-pause');
    assert.equal(findShortcut({ key: 'F8', ctrlKey: true, shiftKey: true }), null);
    assert.equal(findShortcut({ key: 'p', ctrlKey: true, altKey: true }, { registeredGlobals: new Set(['capture-pause']) }), null);
  } finally { setGlobalShortcuts(shortcuts); }
});

test('track monitor keeps independent temporary failures and detaches when capture ends', () => {
  class Track extends EventTarget { muted = false; }
  const video = new Track(); const mic = new Track(); const notifications = []; const ended = [];
  const monitor = watchCaptureTracks([{ track: video, label: 'video' }, { track: mic, label: 'mic' }], (labels) => notifications.push(labels), (label) => ended.push(label));
  video.dispatchEvent(new Event('mute')); mic.dispatchEvent(new Event('mute')); video.dispatchEvent(new Event('unmute'));
  assert.deepEqual(notifications.at(-1), ['mic']);
  mic.dispatchEvent(new Event('ended')); assert.deepEqual(ended, ['mic']);
  monitor.dispose(); video.dispatchEvent(new Event('ended')); assert.equal(ended.length, 1);
  assert.equal(limitMilliseconds(1), 60000); assert.equal(limitMilliseconds(0), 0);
  for (const value of [-1, 0.5, 1441, NaN]) assert.throws(() => limitMilliseconds(value));
});

test('clip copies preserve source, adjust subtitles, avoid collisions and clean failed output', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'winscreen-clips-'));
  try {
    const history = createCaptureHistory(root);
    const original = path.join(root, 'source.mp4'); const captions = path.join(root, 'source.srt');
    await fs.writeFile(original, 'original'); await fs.writeFile(captions, '1\n00:00:00,000 --> 00:00:02,000\nHola\n');
    const record = await history.add({ path: original, subtitlePath: captions, durationMs: 3000, hasAudio: true });
    let fail = false;
    const service = createLibraryService({ history, shell: {}, checkSpace: async () => {}, convertClip: async (_record, target) => { await fs.writeFile(target, 'clip'); if (fail) throw new Error('Conversion failed'); } });
    const first = await service.trim(record.id, 0.5, 1.5);
    const second = await service.trim(record.id, 0.5, 1.5);
    assert.notEqual(first.path, second.path);
    assert.match(await fs.readFile(first.subtitlePath, 'utf8'), /00:00:00,000 --> 00:00:01,000/);
    await service.forget(record.id); assert.equal(await fs.readFile(original, 'utf8'), 'original');
    fail = true;
    await assert.rejects(service.trim((await history.list())[0].id, 0, 0.5), /Conversion/);
    assert.equal((await fs.readdir(root)).some((name) => name.endsWith('.partial.mp4')), false);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
