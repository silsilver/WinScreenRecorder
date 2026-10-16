'use strict';
const fs = require('node:fs/promises');
const { writeJsonAtomically } = require('./atomic-json');

function normalizeBinding(value) {
  if (typeof value !== 'string' || value.length > 60) throw new Error('El atajo no es válido.');
  const tokens = value.replace(/\s/g, '').split('+');
  const key = tokens.pop()?.toUpperCase();
  const modifiers = tokens.map((token) => /^(ctrl|control|commandorcontrol)$/i.test(token) ? 'Ctrl' : /^alt$/i.test(token) ? 'Alt' : /^shift$/i.test(token) ? 'Shift' : null);
  if (!modifiers.length || modifiers.some((item) => !item) || new Set(modifiers).size !== modifiers.length
    || (!modifiers.includes('Ctrl') && !modifiers.includes('Alt')) || !/^(F([1-9]|1\d|2[0-4])|[A-Z0-9])$/.test(key)
    || (key === 'F4' && modifiers.includes('Alt'))) throw new Error('Usa Ctrl o Alt, opcionalmente Shift, y una letra, número o F1–F24. Alt+F4 está reservado para cerrar ventanas.');
  const ordered = ['Ctrl', 'Alt', 'Shift'].filter((item) => modifiers.includes(item));
  return { key, ctrl: ordered.includes('Ctrl'), alt: ordered.includes('Alt'), shift: ordered.includes('Shift'),
    binding: [...ordered, key].join(' + '), accelerator: [...ordered.map((item) => item === 'Ctrl' ? 'CommandOrControl' : item), key].join('+') };
}
function resolveShortcuts(defaults, settings = {}) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('La configuración de atajos no es válida.');
  const actions = defaults.filter((item) => item.scope === 'global').map((item) => item.action);
  if (Object.keys(settings).some((key) => !actions.includes(key))) throw new Error('La acción de teclado no es válida.');
  const resolved = defaults.map((item) => item.scope === 'global' ? { ...item, ...normalizeBinding(settings[item.action] ?? item.accelerator) } : item);
  const bindings = resolved.filter((item) => item.scope === 'global').map((item) => item.accelerator);
  if (new Set(bindings).size !== bindings.length) throw new Error('Dos acciones no pueden usar el mismo atajo.');
  return resolved;
}
async function readShortcutSettings(file) {
  try { const stat = await fs.lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 10000) throw new Error('Archivo de atajos no válido.'); return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}
async function writeShortcutSettings(file, settings) {
  await writeJsonAtomically(file, settings);
}
module.exports = { normalizeBinding, resolveShortcuts, readShortcutSettings, writeShortcutSettings };
