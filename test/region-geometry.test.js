const test = require('node:test');
const assert = require('node:assert/strict');
const { mapRegionToBounds } = require('../src/region-geometry');

test('ubica el rectángulo de video en las coordenadas de la pantalla', () => {
  assert.deepEqual(mapRegionToBounds(
    { x: 320, y: 180, width: 640, height: 360 },
    { width: 1920, height: 1080 },
    { x: -1280, y: 0, width: 1280, height: 720 }
  ), { x: -1067, y: 120, width: 427, height: 240 });
});

test('rechaza dimensiones de captura no válidas', () => {
  assert.throws(() => mapRegionToBounds(
    { x: 0, y: 0, width: 100, height: 100 },
    { width: 0, height: 100 },
    { x: 0, y: 0, width: 100, height: 100 }
  ), /dimensiones.*no son válidas/i);
});
