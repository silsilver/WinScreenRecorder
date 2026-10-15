'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { shortcuts, findShortcut } = require('../src/keyboard-shortcuts');

test('separates starting and stopping and avoids double handling of registered global keys', () => {
  const event = { key: 'F9', ctrlKey: true, shiftKey: true };
  assert.equal(findShortcut(event).action, 'capture-start');
  assert.equal(findShortcut({ ...event, key: 'F10' }).action, 'capture-stop');
  assert.equal(findShortcut(event, { registeredGlobals: new Set(['capture-start']) }), null);
  assert.equal(shortcuts.some((item) => /discard|delete/.test(item.action)), false);
});

test('ignores repeat, IME, AltGr and already consumed keyboard events', () => {
  for (const addition of [{ repeat: true }, { isComposing: true }, { altKey: true }, { metaKey: true }, { defaultPrevented: true }]) {
    assert.equal(findShortcut({ key: 'F9', ctrlKey: true, shiftKey: true, ...addition }), null);
  }
});

test('preserves text editing and keeps help available in text fields', () => {
  for (const target of [{ tagName: 'INPUT', type: 'text' }, { tagName: 'TEXTAREA' }, { isContentEditable: true }]) {
    assert.equal(findShortcut({ key: 's', ctrlKey: true, target }), null);
    assert.equal(findShortcut({ key: 'F1', target }).action, 'help');
  }
  assert.equal(findShortcut({ key: 's', ctrlKey: true, target: { tagName: 'SELECT' } }).action, 'save');
});

test('matches modified number keys by physical code and requires exact modifiers', () => {
  assert.equal(findShortcut({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true }).action, 'microphone');
  assert.equal(findShortcut({ key: '"', code: 'Digit2', ctrlKey: true, shiftKey: true }).action, 'system-audio');
  assert.equal(findShortcut({ key: 's', ctrlKey: true, shiftKey: true }), null);
});

test('limits recovery refresh to its own window and leaves native navigation alone', () => {
  assert.equal(findShortcut({ key: 'F5' }), null);
  assert.equal(findShortcut({ key: 'F5' }, { scope: 'recovery' }).action, 'refresh-recovery');
  for (const key of ['Tab', 'Enter', ' ', 'ArrowRight', 'Delete', 'Backspace']) assert.equal(findShortcut({ key }), null);
});
