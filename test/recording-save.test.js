'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRecoveryStore } = require('../src/recording-recovery');
const { chooseUniqueMediaPath } = require('../src/save-paths');

// Exercise the production save pipeline without booting Electron or downloading a model.
const mainSource = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
function productionFunction(name) {
  const start = mainSource.indexOf(`async function ${name}(`);
  const end = mainSource.indexOf('\nasync function ', start + 1);
  return mainSource.slice(start, end === -1 ? undefined : end);
}

async function withPipeline(run) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'winscreen-save-'));
  try {
    const output = path.join(root, 'output');
    await fsp.mkdir(output);
    const store = createRecoveryStore({ userDataPath: root });
    const record = await store.createSession({ videoDirectory: root, sourceName: 'Pantalla', hasAudio: true });
    await fsp.writeFile(record.mediaPath, 'original video');
    const session = { id: record.id, sourceName: 'Pantalla', status: 'ready', hasAudio: true,
      filePath: record.mediaPath, recoveryManaged: true, recoveryRecord: record };
    const context = vm.createContext({
      fs, fsp, path, recordingSession: session, recoveryStore: store,
      chooseUniqueMediaPath, mainWindow: null, conversions: 0, transcripts: 0,
      requireDiskSpace: async () => {},
      transcriptError: null, conversionError: null,
      refreshTrayMenu() {}, notifySaveProgress() {}, async notifyRecoverySessionsChanged() {},
      safeCaptureFileName: (name) => name,
      getSubtitlePath: (file) => path.join(path.dirname(file), `${path.parse(file).name}.srt`),
      chooseAvailableMediaPath: (file) => file,
      getSaveDirectoryStatus: async () => ({ directory: output, available: true }),
      assertSaveSessionActive(current) { assert.equal(context.recordingSession, current); },
      async setRecoverySessionState(current, state, failureStage = null, failureCode = null) {
        current.recoveryRecord = await store.updateSession(current.id, { state, failureStage, failureCode });
      },
      async runFfmpeg(source, destination) {
        context.conversions++;
        if (context.conversionError) throw new Error(context.conversionError);
        await fsp.copyFile(source, destination);
      },
      async ensureSessionTranscript() {
        context.transcripts++;
        if (context.transcriptError) throw new Error(context.transcriptError);
        const srt = path.join(root, 'captions.srt');
        await fsp.writeFile(srt, '1\n00:00:00,000 --> 00:00:01,000\nHola\n');
        return srt;
      }
    });
    vm.runInContext(['saveRecordingCore', 'finishRecordingSubtitles', 'publishedVideoExists', 'commitOutputPair'].map(productionFunction).join('\n'), context);
    await run({ context, session, store, root, output });
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

test('transcription failure publishes the requested video and preserves a restartable original', async () => {
  await withPipeline(async ({ context, session, store, root }) => {
    context.transcriptError = 'Modelo no disponible';
    const result = await context.saveRecordingCore(session.id, 'mp4', null, session);
    assert.equal(result.status, 'saved');
    assert.equal(result.subtitlesPending, true);
    assert.equal(result.warning, 'Modelo no disponible');
    assert.equal(await fsp.readFile(result.path, 'utf8'), 'original video');
    assert.equal(context.recordingSession, null);
    const restarted = createRecoveryStore({ userDataPath: root });
    const pending = await restarted.getSession(session.id);
    assert.equal(pending.savedMediaPath, result.path);
    assert.equal(pending.failureCode, 'transcription-failed');
    assert.equal(pending.mediaExists, true);
    assert.equal((await store.listSessions()).length, 1);
  });
});

test('retry after restart writes only subtitles and protects an existing SRT', async () => {
  await withPipeline(async ({ context, session, store, root }) => {
    context.transcriptError = 'Sin conexión';
    const first = await context.saveRecordingCore(session.id, 'webm', null, session);
    const existingSrt = context.getSubtitlePath(first.path);
    await fsp.writeFile(existingSrt, 'existing captions');
    const restarted = createRecoveryStore({ userDataPath: root });
    const recovered = { ...session, status: 'ready', recoveryRecord: await restarted.getSession(session.id) };
    context.recordingSession = recovered;
    context.transcriptError = null;
    context.runFfmpeg = () => { throw new Error('Must not reconvert'); };
    context.getSaveDirectoryStatus = () => { throw new Error('Must not choose a new video'); };
    const result = await context.saveRecordingCore(session.id, 'mp4', null, recovered);
    assert.equal(result.status, 'saved');
    assert.equal(result.subtitlesPending, false);
    assert.equal(result.path, first.path);
    assert.notEqual(result.subtitlePath, existingSrt);
    assert.match(await fsp.readFile(result.subtitlePath, 'utf8'), /Hola/);
    assert.equal(await fsp.readFile(existingSrt, 'utf8'), 'existing captions');
    assert.equal(await fsp.readFile(first.path, 'utf8'), 'original video');
    assert.equal(await store.getSession(session.id), null);
  });
});

test('conversion failure preserves the original and does not attempt transcription', async () => {
  await withPipeline(async ({ context, session, output, store }) => {
    context.conversionError = 'Conversión fallida';
    const result = await context.saveRecordingCore(session.id, 'mp4', null, session);
    assert.equal(result.status, 'conversion-failed');
    assert.equal(context.transcripts, 0);
    assert.equal((await store.getSession(session.id)).mediaExists, true);
    assert.deepEqual(await fsp.readdir(output), []);
  });
});

test('successful audio and silent saves clean up recovery only after publishing outputs', async () => {
  for (const hasAudio of [true, false]) {
    await withPipeline(async ({ context, session, store }) => {
      session.hasAudio = hasAudio;
      const result = await context.saveRecordingCore(session.id, 'mp4', null, session);
      assert.equal(result.status, 'saved');
      assert.equal(result.warning, null);
      assert.equal(result.subtitlesPending, false);
      assert.equal(context.transcripts, hasAudio ? 1 : 0);
      assert.equal(await fsp.readFile(result.path, 'utf8'), 'original video');
      assert.equal(Boolean(result.subtitlePath), hasAudio);
      assert.equal(await store.getSession(session.id), null);
    });
  }
});

test('discarding pending subtitles never deletes the published video', async () => {
  await withPipeline(async ({ context, session, store }) => {
    context.transcriptError = 'Sin modelo';
    const result = await context.saveRecordingCore(session.id, 'mp4', null, session);
    await store.removeSession(session.id);
    assert.equal(await fsp.readFile(result.path, 'utf8'), 'original video');
  });
});

test('missing published video retains the original and allows a new export', async () => {
  await withPipeline(async ({ context, session, store }) => {
    context.transcriptError = 'Sin modelo';
    const first = await context.saveRecordingCore(session.id, 'webm', null, session);
    await fsp.rm(first.path);
    session.status = 'ready';
    context.recordingSession = session;
    const retry = await context.saveRecordingCore(session.id, 'mp4', null, session);
    assert.equal(retry.status, 'save-failed');
    assert.equal((await store.getSession(session.id)).mediaExists, true);
    assert.equal((await store.getSession(session.id)).savedMediaPath, null);
    context.transcriptError = null;
    const republished = await context.saveRecordingCore(session.id, 'mp4', null, session);
    assert.equal(republished.status, 'saved');
    assert.equal(await fsp.readFile(republished.path, 'utf8'), 'original video');
  });
});

test('a second transcription failure keeps the same video and recovery session', async () => {
  await withPipeline(async ({ context, session, store, output }) => {
    context.transcriptError = 'Modelo no disponible';
    const first = await context.saveRecordingCore(session.id, 'webm', null, session);
    session.status = 'ready';
    context.recordingSession = session;
    const retry = await context.saveRecordingCore(session.id, 'mp4', null, session);
    assert.equal(retry.status, 'saved');
    assert.equal(retry.subtitlesPending, true);
    assert.equal(retry.path, first.path);
    assert.equal((await store.getSession(session.id)).mediaExists, true);
    assert.deepEqual(await fsp.readdir(output), [path.basename(first.path)]);
  });
});

test('critical output disk space blocks conversion while preserving the original', async () => {
  await withPipeline(async ({ context, session, store, output }) => {
    context.requireDiskSpace = async () => { throw new Error('Espacio crítico'); };
    const result = await context.saveRecordingCore(session.id, 'mp4', null, session);
    assert.equal(result.status, 'conversion-failed');
    assert.equal(context.conversions, 0);
    assert.equal((await store.getSession(session.id)).mediaExists, true);
    assert.deepEqual(await fsp.readdir(output), []);
  });
});
