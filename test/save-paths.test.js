'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { chooseUniqueMediaPath } = require('../src/save-paths');

test('conserva el nombre cuando la ruta todavía está libre', () => {
  assert.equal(chooseUniqueMediaPath('C:\\Videos\\Captura.mp4', () => false), 'C:\\Videos\\Captura.mp4');
});

test('agrega un sufijo cuando el video o su subtítulo ya existe', () => {
  const occupied = new Set(['C:\\Videos\\Captura.mp4', 'C:\\Videos\\Captura (2).mp4']);
  assert.equal(chooseUniqueMediaPath('C:\\Videos\\Captura.mp4', (candidate) => occupied.has(candidate)), 'C:\\Videos\\Captura (3).mp4');
});
