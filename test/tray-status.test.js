'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidTrayCaptureState, getTrayStatusLabel } = require('../src/tray-status');

test('tray distinguishes manual and writing pauses while retaining finalization precedence', () => {
  const recording = { phase: 'recording', sessionStatus: 'recording', paused: true };
  assert.equal(getTrayStatusLabel({ ...recording, pauseReason: 'manual' }), 'Grabación en pausa manual');
  assert.equal(getTrayStatusLabel({ ...recording, pauseReason: 'writing' }), 'Grabación en pausa: guardando datos');
  assert.equal(getTrayStatusLabel({ ...recording, phase: 'finalizing', pauseReason: 'manual' }), 'Finalizando grabación');
  assert.equal(getTrayStatusLabel({ ...recording, saveActive: true, saveStage: 'conversion' }), 'Convirtiendo video');
});

test('pause reasons are validated at the renderer boundary', () => {
  assert.equal(isValidTrayCaptureState('recording', true, 'manual'), true);
  assert.equal(isValidTrayCaptureState('recording', true, 'writing'), true);
  assert.equal(isValidTrayCaptureState('recording', true), true);
  assert.equal(isValidTrayCaptureState('idle', false, 'manual'), false);
  assert.equal(isValidTrayCaptureState('idle', true, 'manual'), false);
  assert.equal(isValidTrayCaptureState('recording', true, 'unknown'), false);
});
