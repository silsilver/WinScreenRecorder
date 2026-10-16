'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('write checkpoints wait for the chunk and propagate disk synchronization failures', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  const start = source.indexOf('function enqueueChunk(');
  const end = source.indexOf('\nasync function closeRecordingStream', start);
  const events = [];
  let failure = null;
  let clock = 16000;
  const context = vm.createContext({ Buffer, ArrayBuffer, performance: { now: () => clock },
    fsyncAsync: async (fd) => { events.push(`sync:${fd}`); if (failure) throw failure; } });
  vm.runInContext(source.slice(start, end), context);
  const session = { lastCheckpoint: 0, writeError: null, writeChain: Promise.resolve(),
    stream: { fd: 7, write(_bytes, callback) { events.push('write'); callback(); } } };
  await context.enqueueChunk(session, Buffer.from('first'));
  assert.deepEqual(events, ['write', 'sync:7']);
  events.length = 0; clock = 17000;
  await context.enqueueChunk(session, Buffer.from('next'));
  assert.deepEqual(events, ['write']);
  clock = 32000; failure = new Error('Disk unavailable');
  await assert.rejects(context.enqueueChunk(session, Buffer.from('last')), /Disk unavailable/);
});

test('recording finalization waits for stream close and rejects a late disk failure', { timeout: 3000 }, async () => {
  const source = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  const start = source.indexOf('async function closeRecordingStream(');
  const end = source.indexOf('\nfunction getOutputOptions', start);
  const { EventEmitter, once } = require('node:events');
  const stream = new EventEmitter(); stream.end = () => { stream.emit('finish'); };
  const context = vm.createContext({ once });
  vm.runInContext(source.slice(start, end), context);
  const session = { writeChain: Promise.resolve(), writeError: null, stream, status: 'recording' };
  const completion = context.closeRecordingStream(session);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.status, 'recording');
  stream.emit('close'); await completion; assert.equal(session.status, 'ready');
  session.status = 'recording';
  const failing = context.closeRecordingStream(session);
  await new Promise((resolve) => setImmediate(resolve));
  stream.emit('error', new Error('Flush failed'));
  await assert.rejects(failing, /Flush failed/); assert.equal(session.status, 'recording');
});

test('cancellation belongs to its window and waits for cleanup before acknowledging', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  const start = source.indexOf('async function cancelActiveOperation(');
  const end = source.indexOf('\nasync function importHistoryCapture', start);
  const owner = {}; const events = [];
  let finish;
  const context = vm.createContext({ activeCancellation: { owner, cancelled: false },
    activeSavePromise: new Promise((resolve) => { finish = resolve; }),
    recordingSession: { status: 'saving' }, downloadRequest: null,
    activeChildProcess: { killed: false, kill() { events.push('kill'); } } });
  vm.runInContext(source.slice(start, end), context);
  assert.equal(await context.cancelActiveOperation({}), false);
  assert.deepEqual(events, []);
  const cancelling = context.cancelActiveOperation(owner);
  assert.equal(context.recordingSession.cancelRequested, true);
  assert.deepEqual(events, ['kill']);
  finish(); assert.equal(await cancelling, true);
});
