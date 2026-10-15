'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { configureAppLifecycle, UPDATE_ARGUMENT } = require('../src/app-lifecycle');

function fakeApp(ownsInstance = true) {
  const listeners = new Map();
  return {
    listeners, quits: 0,
    requestSingleInstanceLock(data) { this.request = data; return ownsInstance; },
    whenReady: () => Promise.resolve(),
    on(name, listener) { listeners.set(name, listener); },
    quit() { this.quits += 1; }
  };
}

test('a second normal launch activates the existing application', () => {
  const app = fakeApp();
  let activations = 0;
  let updates = 0;
  assert.equal(configureAppLifecycle({ app, args: [], onSecondLaunch: () => activations++, onUpdateRequest: () => updates++ }), true);
  app.listeners.get('second-instance')({}, ['recorder.exe'], '', {});
  assert.equal(activations, 1);
  assert.equal(updates, 0);
});

test('update requests close the primary instance without opening another window', () => {
  const app = fakeApp();
  let activations = 0;
  let updates = 0;
  configureAppLifecycle({ app, args: [], onSecondLaunch: () => activations++, onUpdateRequest: () => updates++ });
  app.listeners.get('second-instance')({}, ['recorder.exe', UPDATE_ARGUMENT], '', {});
  app.listeners.get('second-instance')({}, ['recorder.exe'], '', { updateRequested: true });
  assert.equal(updates, 2);
  assert.equal(activations, 0);
});

test('a secondary process forwards its update request and exits without bootstrapping', async () => {
  const app = fakeApp(false);
  assert.equal(configureAppLifecycle({ app, args: ['recorder.exe', UPDATE_ARGUMENT] }), false);
  await Promise.resolve();
  assert.equal(app.request.updateRequested, true);
  assert.equal(app.quits, 1);
  assert.equal(app.listeners.size, 0);
});

test('an update command without an existing instance exits without starting the app', async () => {
  const app = fakeApp();
  assert.equal(configureAppLifecycle({ app, args: [UPDATE_ARGUMENT] }), false);
  await Promise.resolve();
  assert.equal(app.quits, 1);
});
