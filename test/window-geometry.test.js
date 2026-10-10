const test = require('node:test');
const assert = require('node:assert/strict');
const { mapPhysicalRectToDisplay } = require('../src/window-geometry');

test('convierte límites físicos de ventana a coordenadas Electron con DPI al 200 %', () => {
  assert.deepEqual(mapPhysicalRectToDisplay(
    { x: 200, y: 100, width: 1600, height: 900 },
    { x: 0, y: 0, width: 3840, height: 2160 },
    { bounds: { x: 0, y: 0, width: 1920, height: 1080 } }
  ), { x: 100, y: 50, width: 800, height: 450 });
});

test('conserva el desplazamiento de monitores y la escala DPI en una pantalla secundaria', () => {
  assert.deepEqual(mapPhysicalRectToDisplay(
    { x: 2000, y: -900, width: 1200, height: 800 },
    { x: 1920, y: -1080, width: 2560, height: 1440 },
    { bounds: { x: 960, y: -540, width: 1280, height: 720 } }
  ), { x: 1000, y: -450, width: 600, height: 400 });
});

test('rechaza límites de ventana o monitor sin dimensiones válidas', () => {
  assert.throws(() => mapPhysicalRectToDisplay(
    { x: 0, y: 0, width: 0, height: 100 },
    { x: 0, y: 0, width: 1920, height: 1080 },
    { bounds: { x: 0, y: 0, width: 1920, height: 1080 } }
  ), /dimensiones.*no son válidas/i);
});
