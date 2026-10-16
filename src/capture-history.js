'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { writeJsonAtomically } = require('./atomic-json');
const MEDIA_EXTENSIONS = new Set(['.webm', '.mp4', '.mkv', '.gif', '.png', '.jpg']);

function validateMediaPath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /[\u0000-\u001f]/.test(value)
    || !MEDIA_EXTENSIONS.has(path.extname(value).toLowerCase())) throw new Error('La ruta de la captura no es válida.');
  return path.resolve(value);
}
function createCaptureHistory(userDataPath) {
  const file = path.join(userDataPath, 'capture-history.json');
  let queue = Promise.resolve();
  async function read() {
    let data;
    try {
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error('El historial no es un archivo válido.');
      data = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) { if (error.code === 'ENOENT') return []; throw new Error('No se pudo leer el historial. Se conservará sin sobrescribirlo.'); }
    if (!Array.isArray(data) || data.length > 100) throw new Error('El historial no es válido.');
    return data.map((item) => {
      if (!item || typeof item.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(item.id)) throw new Error('El registro de historial no es válido.');
      return { id: item.id, path: validateMediaPath(item.path), name: String(item.name || 'Captura').slice(0, 120),
        customName: item.customName === true,
        savedAt: String(item.savedAt), durationMs: Number.isFinite(item.durationMs) && item.durationMs > 0 ? item.durationMs : null,
        hasAudio: item.hasAudio === true, subtitlePath: item.subtitlePath === null || item.subtitlePath === undefined ? null
          : typeof item.subtitlePath === 'string' && path.isAbsolute(item.subtitlePath) && path.extname(item.subtitlePath).toLowerCase() === '.srt' ? item.subtitlePath : null };
    });
  }
  function mutate(change) {
    const result = queue.then(async () => {
      const records = await read();
      const { updated, value } = change(records);
      await fs.mkdir(userDataPath, { recursive: true });
      await writeJsonAtomically(file, updated);
      return value;
    });
    queue = result.catch(() => {});
    return result;
  }
  return {
    async list() { await queue; return read(); },
    async get(id) { return (await this.list()).find((item) => item.id === id) || null; },
    add(input) {
      const mediaPath = validateMediaPath(input.path);
      return mutate((records) => {
        const previous = records.find((item) => item.path.toLowerCase() === mediaPath.toLowerCase());
        const item = { ...input, id: previous?.id || randomUUID(), path: mediaPath,
          name: previous?.customName ? previous.name : String(input.name || path.basename(mediaPath)).slice(0, 120),
          customName: previous?.customName === true, savedAt: previous?.savedAt || new Date().toISOString() };
        return { updated: [item, ...records.filter((entry) => entry.id !== item.id)].slice(0, 100), value: item };
      });
    },
    rename(id, name) {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 120 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('Indica un nombre de 1 a 120 caracteres, sin caracteres de control.');
      return mutate((records) => {
        const item = records.find((record) => record.id === id);
        if (!item) throw new Error('La captura ya no está en el historial.');
        const updated = { ...item, name: name.trim(), customName: true };
        return { updated: records.map((record) => record.id === id ? updated : record), value: updated };
      });
    },
    forget(id) { return mutate((records) => ({ updated: records.filter((item) => item.id !== id), value: true })); }
  };
}
module.exports = { createCaptureHistory, validateMediaPath };
