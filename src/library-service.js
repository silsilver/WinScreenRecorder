'use strict';
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chooseUniqueMediaPath } = require('./save-paths');
const { validateClip, trimSrt } = require('./clip-tools');

function createLibraryService({ history, shell, convertClip, checkSpace, checkCancelled = () => {} }) {
  async function getAvailable(id) {
    const record = await history.get(id);
    if (!record) throw new Error('La captura ya no está en el historial.');
    const stat = await fs.lstat(record.path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) throw new Error('El archivo ya no está disponible. El historial no modifica el original.');
    return record;
  }
  return {
    async list() {
      return Promise.all((await history.list()).map(async (record) => {
        let available = false;
        let sizeBytes = null;
        try { const stat = await fs.lstat(record.path); available = stat.isFile() && !stat.isSymbolicLink() && stat.size > 0; if (available) sizeBytes = stat.size; } catch {}
        return { ...record, available, sizeBytes, format: path.extname(record.path).slice(1).toUpperCase(), previewUrl: available ? pathToFileURL(record.path).href : null };
      }));
    },
    async open(id, folder = false) {
      const record = await getAvailable(id);
      if (folder) shell.showItemInFolder(record.path);
      else { const error = await shell.openPath(record.path); if (error) throw new Error(error); }
    },
    async trim(id, start, end) {
      const record = await getAvailable(id);
      if (!['.mp4', '.mkv', '.webm'].includes(path.extname(record.path).toLowerCase())) throw new Error('El recorte está disponible para MP4, MKV y WebM.');
      const clip = validateClip(start, end, record.durationMs);
      await checkSpace(path.dirname(record.path));
      const target = chooseUniqueMediaPath(path.join(path.dirname(record.path), `${path.parse(record.path).name}-recorte.mp4`),
        (candidate) => existsSync(candidate) || existsSync(candidate.replace(/\.mp4$/, '.srt')));
      const temporary = path.join(path.dirname(target), `.${randomUUID()}.partial.mp4`);
      let subtitlePath = null;
      let warning = null;
      try {
        await convertClip(record, temporary, clip);
        checkCancelled();
        if ((await fs.stat(temporary)).size === 0) throw new Error('El recorte generado está vacío.');
        await fs.copyFile(temporary, target, constants.COPYFILE_EXCL);
      } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
      if (record.subtitlePath) {
        try {
          const stat = await fs.lstat(record.subtitlePath);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024 * 1024) throw new Error('El SRT no está disponible o es demasiado grande.');
          const text = trimSrt(await fs.readFile(record.subtitlePath, 'utf8'), start, end);
          const subtitleTarget = target.replace(/\.mp4$/, '.srt');
          const subtitleTemporary = `${temporary}.srt`;
          try { await fs.writeFile(subtitleTemporary, text, { flag: 'wx' }); await fs.copyFile(subtitleTemporary, subtitleTarget, constants.COPYFILE_EXCL); subtitlePath = subtitleTarget; }
          finally { await fs.rm(subtitleTemporary, { force: true }).catch(() => {}); }
        } catch (error) { subtitlePath = null; warning = `El video se guardó, pero no se pudieron ajustar los subtítulos: ${error.message}`; }
      }
      try { await history.add({ path: target, name: `${record.name} · recorte`, subtitlePath, hasAudio: record.hasAudio, durationMs: clip.durationMs }); }
      catch (error) { warning = [warning, `El recorte se guardó en ${target}, pero falló el historial: ${error.message}`].filter(Boolean).join(' '); }
      return { path: target, subtitlePath, warning };
    },
    rename: (id, name) => history.rename(id, name),
    forget: (id) => history.forget(id)
  };
}
module.exports = { createLibraryService };
