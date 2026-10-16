'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createRecoveryStore, RECOVERY_FOLDER_NAME } = require('../src/recording-recovery');

async function withRecoveryStore(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'winscreen-recovery-'));
  try {
    await run({
      root,
      videoDirectory: path.join(root, 'Videos'),
      store: createRecoveryStore({ userDataPath: root })
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('persists a new session under the configured video recovery folder', async () => {
  await withRecoveryStore(async ({ root, videoDirectory, store }) => {
    const record = await store.createSession({
      id: randomUUID(),
      videoDirectory,
      sourceName: 'Pantalla principal',
      startedAt: '2026-10-15T18:00:00.000Z'
    });

    assert.equal(record.state, 'recording');
    assert.equal(record.recoveryDirectory, path.join(videoDirectory, RECOVERY_FOLDER_NAME));
    assert.equal(record.mediaPath, path.join(record.recoveryDirectory, record.mediaFileName));
    assert.equal(record.mediaExists, true);
    assert.equal(await fs.readFile(path.join(root, 'recording-recovery', `${record.id}.json`), 'utf8').then(Boolean), true);
  });
});

test('lists a session and state after a new store instance is created', async () => {
  await withRecoveryStore(async ({ root, videoDirectory, store }) => {
    const record = await store.createSession({
      id: randomUUID(),
      videoDirectory,
      sourceName: 'Ventana de prueba'
    });
    await fs.mkdir(record.recoveryDirectory, { recursive: true });
    await fs.writeFile(record.mediaPath, Buffer.from('webm-data'));
    await store.updateSession(record.id, { state: 'transcribing', hasAudio: true });

    const restartedStore = createRecoveryStore({ userDataPath: root });
    const recovered = await restartedStore.getSession(record.id);

    assert.equal(recovered.state, 'transcribing');
    assert.equal(recovered.hasAudio, true);
    assert.equal(recovered.mediaExists, true);
    assert.equal(recovered.mediaSize, 9);
  });
});

test('rejects an invalid identifier before building a manifest path', async () => {
  await withRecoveryStore(async ({ store }) => {
    await assert.rejects(store.getSession('..\\outside'), /identificador/);
  });
});

test('recovery retains the selected quality and elapsed duration after restart', async () => {
  await withRecoveryStore(async ({ root, videoDirectory, store }) => {
    const record = await store.createSession({ videoDirectory, sourceName: 'Pantalla', videoOptions: { frameRate: 60, videoBitsPerSecond: 16000000 } });
    await store.updateSession(record.id, { state: 'ready', durationMs: 12345 });
    const restored = await createRecoveryStore({ userDataPath: root }).getSession(record.id);
    assert.deepEqual(restored.videoOptions, { frameRate: 60, videoBitsPerSecond: 16000000 });
    assert.equal(restored.durationMs, 12345);
  });
});

test('accepts old manifests without a saved video and rejects unsafe published paths', async () => {
  await withRecoveryStore(async ({ root, videoDirectory, store }) => {
    const record = await store.createSession({ videoDirectory, sourceName: 'Pantalla' });
    assert.equal(record.savedMediaPath, null);
    const manifestPath = path.join(root, 'recording-recovery', `${record.id}.json`);
    const legacy = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    delete legacy.savedMediaPath;
    await fs.writeFile(manifestPath, JSON.stringify(legacy));
    assert.equal((await store.getSession(record.id)).savedMediaPath, null);
    for (const savedMediaPath of ['relative.mp4', path.join(root, 'script.exe'), 123]) {
      await assert.rejects(store.updateSession(record.id, { savedMediaPath }), /ruta del video/);
    }
  });
});

test('rejects a manifest media name that escapes its recovery directory', async () => {
  await withRecoveryStore(async ({ root, videoDirectory, store }) => {
    const record = await store.createSession({
      id: randomUUID(),
      videoDirectory,
      sourceName: 'Desktop'
    });
    const manifestPath = path.join(root, 'recording-recovery', `${record.id}.json`);
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    manifest.mediaFileName = '..\\outside.webm';
    await fs.writeFile(manifestPath, JSON.stringify(manifest));

    await assert.rejects(store.getSession(record.id), /nombre del archivo/);
  });
});

test('removes only the validated session media and manifest', async () => {
  await withRecoveryStore(async ({ root, videoDirectory, store }) => {
    const record = await store.createSession({
      id: randomUUID(),
      videoDirectory,
      sourceName: 'Desktop'
    });
    await fs.writeFile(record.mediaPath, Buffer.from('webm-data'));
    await store.updateSession(record.id, { state: 'ready', hasAudio: false });

    assert.equal(await store.removeSession(record.id), true);
    assert.equal(await store.getSession(record.id), null);
    await assert.rejects(fs.stat(record.mediaPath), { code: 'ENOENT' });
    await assert.rejects(fs.stat(path.join(root, 'recording-recovery', `${record.id}.json`)), { code: 'ENOENT' });
  });
});

test('lists a manifest with missing media as unavailable without discarding its state', async () => {
  await withRecoveryStore(async ({ videoDirectory, store }) => {
    const record = await store.createSession({
      id: randomUUID(),
      videoDirectory,
      sourceName: 'Captura sin archivo'
    });
    await store.updateSession(record.id, { state: 'interrupted-recording' });
    await fs.rm(record.mediaPath);

    const [listed] = await store.listSessions();
    assert.equal(listed.id, record.id);
    assert.equal(listed.state, 'interrupted-recording');
    assert.equal(listed.mediaExists, false);
  });
});

test('keeps a repair backup available after interruption during atomic replacement', async () => {
  await withRecoveryStore(async ({ videoDirectory, store }) => {
    const record = await store.createSession({
      id: randomUUID(),
      videoDirectory,
      sourceName: 'Captura en reparación'
    });
    await fs.rm(record.mediaPath);
    await fs.writeFile(`${record.mediaPath}.repair-backup`, Buffer.from('original-webm'));

    const [listed] = await store.listSessions();
    assert.equal(listed.id, record.id);
    assert.equal(listed.mediaExists, true);
    assert.equal(listed.repairBackupExists, true);
    assert.equal(listed.mediaSize, Buffer.byteLength('original-webm'));
  });
});

test('allows removing a damaged manifest without following its untrusted media path', async () => {
  await withRecoveryStore(async ({ root, store }) => {
    const id = randomUUID();
    const manifestPath = path.join(root, 'recording-recovery', `${id}.json`);
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, JSON.stringify({
      schemaVersion: 1,
      id,
      videoDirectory: root,
      recoveryDirectory: 'C:\\',
      mediaFileName: 'important-file.txt',
      state: 'ready'
    }));

    const [listed] = await store.listSessions();
    assert.equal(listed.id, id);
    assert.equal(listed.manifestInvalid, true);
    assert.equal(await store.removeSession(id), true);
    await assert.rejects(fs.stat(manifestPath), { code: 'ENOENT' });
  });
});
