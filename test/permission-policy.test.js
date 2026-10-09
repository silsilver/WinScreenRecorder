'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { allowMicrophoneRequest } = require('../src/permission-policy');

test('solo autoriza audio del renderer confiable cuando el micrófono está habilitado', () => {
  assert.equal(allowMicrophoneRequest({ trusted: true, permission: 'media', mediaTypes: ['audio'], microphoneEnabled: true }), true);
});

test('el audio de sistema no habilita permisos de micrófono', () => {
  assert.equal(allowMicrophoneRequest({ trusted: true, permission: 'media', mediaTypes: ['audio'], microphoneEnabled: false, systemAudioEnabled: true }), false);
});

test('rechaza video, permisos ajenos y solicitudes de otro renderer', () => {
  for (const input of [
    { trusted: false, permission: 'media', mediaTypes: ['audio'], microphoneEnabled: true },
    { trusted: true, permission: 'media', mediaTypes: ['audio', 'video'], microphoneEnabled: true },
    { trusted: true, permission: 'camera', mediaTypes: ['audio'], microphoneEnabled: true }
  ]) assert.equal(allowMicrophoneRequest(input), false);
});
