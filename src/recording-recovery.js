'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { normalizeVideoOptions, normalizeDuration } = require('./video-options');

const RECOVERY_FOLDER_NAME = 'Recuperación';
const MANIFEST_FOLDER_NAME = 'recording-recovery';
const MANIFEST_VERSION = 1;
const SESSION_STATES = new Set([
  'recording',
  'interrupted-recording',
  'ready',
  'transcribing',
  'converting',
  'finalizing',
  'failed',
  'unrecoverable'
]);
const FAILURE_STAGES = new Set([
  'capture',
  'transcription',
  'conversion',
  'finalizing',
  'recovery'
]);
const FAILURE_CODES = new Set([
  'capture-write-failed',
  'source-missing',
  'source-invalid',
  'transcription-failed',
  'conversion-failed',
  'finalization-failed',
  'unknown'
]);
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MANIFEST_FILE_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.json$/i;

function assertSessionId(id) {
  if (typeof id !== 'string' || !SESSION_ID_PATTERN.test(id)) {
    throw new Error('El identificador de recuperación no es válido.');
  }
}

function sanitizeDisplayName(value) {
  return String(value ?? 'Grabación')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Grabación';
}

function validateVideoDirectory(videoDirectory) {
  if (typeof videoDirectory !== 'string' || !path.isAbsolute(videoDirectory)) {
    throw new Error('La carpeta de videos no es válida.');
  }
  return path.resolve(videoDirectory);
}

function deriveRecoveryDirectory(videoDirectory) {
  return path.resolve(videoDirectory, RECOVERY_FOLDER_NAME);
}

function deriveMediaFileName(id) {
  return `winscreen-${id}.partial.webm`;
}

function normalizeManifest(raw, expectedId = null) {
  if (!raw || typeof raw !== 'object' || raw.schemaVersion !== MANIFEST_VERSION) {
    throw new Error('El registro de recuperación no es válido.');
  }

  const { id } = raw;
  assertSessionId(id);
  if (expectedId && id.toLowerCase() !== expectedId.toLowerCase()) {
    throw new Error('El registro de recuperación no coincide con su archivo.');
  }

  const videoDirectory = validateVideoDirectory(raw.videoDirectory);
  const recoveryDirectory = deriveRecoveryDirectory(videoDirectory);
  if (typeof raw.recoveryDirectory !== 'string'
    || path.resolve(raw.recoveryDirectory) !== recoveryDirectory) {
    throw new Error('La carpeta de recuperación no es válida.');
  }

  const mediaFileName = deriveMediaFileName(id);
  if (raw.mediaFileName !== mediaFileName || path.basename(raw.mediaFileName) !== raw.mediaFileName) {
    throw new Error('El nombre del archivo de recuperación no es válido.');
  }

  if (!SESSION_STATES.has(raw.state)) {
    throw new Error('El estado de recuperación no es válido.');
  }

  const startedAt = new Date(raw.startedAt);
  if (!Number.isFinite(startedAt.getTime())) {
    throw new Error('La fecha de recuperación no es válida.');
  }

  const failureStage = raw.failureStage == null ? null : raw.failureStage;
  const failureCode = raw.failureCode == null ? null : raw.failureCode;
  if (failureStage !== null && !FAILURE_STAGES.has(failureStage)) {
    throw new Error('La etapa de recuperación no es válida.');
  }
  if (failureCode !== null && !FAILURE_CODES.has(failureCode)) {
    throw new Error('El código de recuperación no es válido.');
  }
  if (failureStage === null && failureCode !== null) {
    throw new Error('El registro de recuperación está incompleto.');
  }

  const savedMediaPath = raw.savedMediaPath ?? null;
  if (savedMediaPath !== null && (typeof savedMediaPath !== 'string'
    || !path.isAbsolute(savedMediaPath)
    || !['.webm', '.mp4', '.mkv', '.gif'].includes(path.extname(savedMediaPath).toLowerCase())
    || /[\u0000-\u001f]/.test(savedMediaPath))) {
    throw new Error('La ruta del video guardado no es válida.');
  }

  return {
    schemaVersion: MANIFEST_VERSION,
    id,
    videoDirectory,
    recoveryDirectory,
    mediaFileName,
    sourceName: sanitizeDisplayName(raw.sourceName),
    startedAt: startedAt.toISOString(),
    hasAudio: typeof raw.hasAudio === 'boolean' ? raw.hasAudio : null,
    state: raw.state,
    failureStage,
    failureCode,
    savedMediaPath,
    videoOptions: normalizeVideoOptions(raw.videoOptions),
    durationMs: normalizeDuration(raw.durationMs ?? null),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : startedAt.toISOString()
  };
}

function createRecoveryStore({ userDataPath }) {
  if (typeof userDataPath !== 'string' || !path.isAbsolute(userDataPath)) {
    throw new Error('La carpeta de datos de la aplicación no es válida.');
  }

  const manifestDirectory = path.join(path.resolve(userDataPath), MANIFEST_FOLDER_NAME);

  async function ensureManifestDirectory() {
    await fs.mkdir(manifestDirectory, { recursive: true });
    const stat = await fs.lstat(manifestDirectory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('La carpeta de registros de recuperación no es segura.');
    }
  }

  async function ensureRecoveryDirectory(directory) {
    await fs.mkdir(directory, { recursive: true });
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('La carpeta de recuperación no es segura.');
    }
  }

  function getManifestPath(id) {
    assertSessionId(id);
    return path.join(manifestDirectory, `${id.toLowerCase()}.json`);
  }

  function getMediaPath(record) {
    const normalized = normalizeManifest(record, record.id);
    const mediaPath = path.resolve(normalized.recoveryDirectory, normalized.mediaFileName);
    if (path.dirname(mediaPath) !== normalized.recoveryDirectory) {
      throw new Error('La ruta del archivo de recuperación no es válida.');
    }
    return mediaPath;
  }

  async function writeManifest(record) {
    const normalized = normalizeManifest(record, record.id);
    await ensureManifestDirectory();
    const manifestPath = getManifestPath(normalized.id);
    const partialPath = `${manifestPath}.${randomUUID()}.partial`;
    let handle;

    try {
      handle = await fs.open(partialPath, 'wx', 0o600);
      await handle.writeFile(JSON.stringify(normalized, null, 2), 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rename(partialPath, manifestPath);
      return normalized;
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      await fs.rm(partialPath, { force: true }).catch(() => {});
      throw error;
    }
  }

  async function readSession(id) {
    await ensureManifestDirectory();
    const manifestPath = getManifestPath(id);
    const manifestStat = await fs.lstat(manifestPath);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
      const error = new Error('El registro de recuperación no es un archivo regular.');
      error.code = 'INVALID_RECOVERY_MANIFEST';
      throw error;
    }
    const contents = await fs.readFile(manifestPath, 'utf8');
    let raw;
    try {
      raw = JSON.parse(contents);
    } catch {
      const error = new Error('El registro de recuperación está dañado.');
      error.code = 'INVALID_RECOVERY_MANIFEST';
      throw error;
    }
    let record;
    try {
      record = normalizeManifest(raw, id);
    } catch (error) {
      error.code = 'INVALID_RECOVERY_MANIFEST';
      throw error;
    }
    const mediaPath = getMediaPath(record);
    const repairBackupPath = `${mediaPath}.repair-backup`;
    let mediaExists = false;
    let mediaSize = 0;
    try {
      const directoryStat = await fs.lstat(record.recoveryDirectory);
      if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
        const error = new Error('La carpeta de recuperación no es segura.');
        error.code = 'INVALID_RECOVERY_MANIFEST';
        throw error;
      }
      const stat = await fs.lstat(mediaPath);
      mediaExists = stat.isFile() && !stat.isSymbolicLink();
      mediaSize = mediaExists ? stat.size : 0;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    let repairBackupExists = false;
    if (!mediaExists) {
      try {
        const backupStat = await fs.lstat(repairBackupPath);
        repairBackupExists = backupStat.isFile() && !backupStat.isSymbolicLink();
        mediaSize = repairBackupExists ? backupStat.size : 0;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    return { ...record, mediaExists: mediaExists || repairBackupExists, mediaSize, mediaPath, repairBackupExists };
  }

  async function createSession({ id = randomUUID(), videoDirectory, sourceName, startedAt = new Date().toISOString(), hasAudio = null, videoOptions = {} }) {
    assertSessionId(id);
    const safeVideoDirectory = validateVideoDirectory(videoDirectory);
    const recoveryDirectory = deriveRecoveryDirectory(safeVideoDirectory);
    const record = normalizeManifest({
      schemaVersion: MANIFEST_VERSION,
      id,
      videoDirectory: safeVideoDirectory,
      recoveryDirectory,
      mediaFileName: deriveMediaFileName(id),
      sourceName,
      startedAt: new Date(startedAt).toISOString(),
      hasAudio: typeof hasAudio === 'boolean' ? hasAudio : null,
      videoOptions,
      state: 'recording',
      failureStage: null,
      failureCode: null,
      updatedAt: new Date().toISOString()
    }, id);

    await ensureRecoveryDirectory(recoveryDirectory);
    const mediaPath = getMediaPath(record);
    const handle = await fs.open(mediaPath, 'wx', 0o600);
    await handle.close();
    try {
      await writeManifest(record);
    } catch (error) {
      await fs.rm(mediaPath, { force: true }).catch(() => {});
      throw error;
    }
    return { ...record, mediaExists: true, mediaSize: 0, mediaPath };
  }

  async function updateSession(id, changes) {
    const current = await readSession(id);
    const allowedKeys = new Set(['state', 'hasAudio', 'failureStage', 'failureCode', 'savedMediaPath', 'durationMs']);
    if (!changes || typeof changes !== 'object'
      || Object.keys(changes).some((key) => !allowedKeys.has(key))) {
      throw new Error('La actualización de recuperación contiene campos no permitidos.');
    }

    const updated = {
      ...current,
      ...changes,
      updatedAt: new Date().toISOString()
    };
    const normalized = normalizeManifest(updated, id);
    const saved = await writeManifest(normalized);
    return {
      ...saved,
      mediaExists: current.mediaExists,
      mediaSize: current.mediaSize,
      mediaPath: current.mediaPath,
      repairBackupExists: current.repairBackupExists
    };
  }

  async function getSession(id) {
    assertSessionId(id);
    try {
      return await readSession(id);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async function listSessions() {
    await ensureManifestDirectory();
    let names;
    try {
      names = await fs.readdir(manifestDirectory);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }

    const sessions = [];
    for (const name of names) {
      const match = MANIFEST_FILE_PATTERN.exec(name);
      if (!match) continue;
      try {
        const record = await readSession(match[1]);
        sessions.push(record);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          sessions.push({
            id: match[1],
            sourceName: 'Registro de recuperación dañado',
            startedAt: null,
            state: 'unrecoverable',
            failureStage: 'recovery',
            failureCode: 'source-invalid',
            mediaExists: false,
            mediaSize: 0,
            mediaPath: null,
            manifestInvalid: true
          });
        }
      }
    }
    return sessions.sort((a, b) => String(b.startedAt ?? '').localeCompare(String(a.startedAt ?? '')));
  }

  async function removeSession(id) {
    assertSessionId(id);
    let record;
    try {
      record = await getSession(id);
    } catch (error) {
      if (error.code !== 'INVALID_RECOVERY_MANIFEST') throw error;
      await fs.rm(getManifestPath(id), { force: true });
      return true;
    }
    if (!record) return false;

    if (record.mediaPath) {
      await fs.rm(record.mediaPath, { force: true });
      await fs.rm(`${record.mediaPath}.repair-backup`, { force: true });
    }
    await fs.rm(getManifestPath(id), { force: true });
    return true;
  }

  return {
    createSession,
    updateSession,
    getSession,
    listSessions,
    removeSession
  };
}

module.exports = {
  createRecoveryStore,
  RECOVERY_FOLDER_NAME,
  SESSION_STATES
};
