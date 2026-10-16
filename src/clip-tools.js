'use strict';
function validateClip(start, end, durationMs) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end - start < 0.1
    || end > 30 * 86400 || (durationMs > 0 && end * 1000 > durationMs + 100)) throw new Error('Indica un inicio y un final válidos dentro de la duración del video.');
  return { start, end, durationMs: (end - start) * 1000 };
}
function timeToMs(value) {
  const match = /^(\d{2,}):(\d{2}):(\d{2}),(\d{3})$/.exec(value);
  if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) throw new Error('Subtítulos con tiempo no válido.');
  return ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4]);
}
function msToTime(ms) {
  ms = Math.round(ms);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}
function trimSrt(contents, startSeconds, endSeconds) {
  const result = [];
  const text = contents.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const match = /^(\S+) --> (\S+)$/.exec(lines[1] || '');
    if (!/^\d+$/.test(lines[0]) || !match || lines.length < 3) throw new Error('Los subtítulos no tienen un formato SRT válido.');
    const start = Math.max(timeToMs(match[1]), startSeconds * 1000);
    const end = Math.min(timeToMs(match[2]), endSeconds * 1000);
    if (end > start) result.push(`${result.length + 1}\n${msToTime(start - startSeconds * 1000)} --> ${msToTime(end - startSeconds * 1000)}\n${lines.slice(2).join('\n')}`);
  }
  return result.length ? result.join('\n\n') + '\n' : '';
}
module.exports = { validateClip, trimSrt };
