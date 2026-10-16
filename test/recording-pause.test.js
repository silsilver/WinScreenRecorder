'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecordingPauseController } = require('../src/recording-pause');

function setup() {
  let time = 0;
  const recorder = {
    state: 'recording', pauses: 0, resumes: 0,
    pause() { this.state = 'paused'; this.pauses++; },
    resume() { this.state = 'recording'; this.resumes++; }
  };
  const pause = createRecordingPauseController({ recorder, now: () => time });
  return { recorder, pause, at(value) { time = value; } };
}

test('manual pause freezes elapsed recording time, including a pause beginning at zero', () => {
  const { recorder, pause, at } = setup();
  pause.toggleManual();
  at(2500);
  assert.equal(pause.getPausedDuration(), 2500);
  assert.equal(pause.getState().reason, 'manual');
  pause.toggleManual();
  at(5000);
  assert.equal(pause.getPausedDuration(), 2500);
  assert.equal(recorder.state, 'recording');
  pause.toggleManual();
  at(6000);
  pause.toggleManual();
  assert.equal(pause.getPausedDuration(), 3500);
});

test('draining the write queue cannot release a manual pause', () => {
  const { recorder, pause, at } = setup();
  at(100);
  pause.toggleManual();
  pause.updatePendingBytes(24 * 1024 * 1024);
  at(1000);
  pause.updatePendingBytes(0);
  assert.equal(recorder.state, 'paused');
  assert.equal(recorder.resumes, 0);
  at(2100);
  pause.toggleManual();
  assert.equal(recorder.state, 'recording');
  assert.equal(pause.getPausedDuration(), 2000);
  assert.equal(recorder.pauses, 1);
});

test('manual resume waits for the write queue and counts overlapping pauses only once', () => {
  const { recorder, pause, at } = setup();
  at(100);
  pause.updatePendingBytes(24 * 1024 * 1024);
  pause.toggleManual();
  at(1000);
  pause.toggleManual();
  assert.equal(pause.getState().reason, 'writing');
  pause.updatePendingBytes(9 * 1024 * 1024);
  assert.equal(recorder.state, 'paused');
  at(2100);
  pause.updatePendingBytes(8 * 1024 * 1024);
  assert.equal(recorder.state, 'recording');
  assert.equal(pause.getPausedDuration(), 2000);
  assert.equal(recorder.resumes, 1);
});

test('automatic pause starts at 24 MiB, holds until 8 MiB, and tolerates repeated updates', () => {
  const { recorder, pause } = setup();
  pause.updatePendingBytes(23 * 1024 * 1024);
  assert.equal(recorder.pauses, 0);
  pause.updatePendingBytes(24 * 1024 * 1024);
  pause.updatePendingBytes(25 * 1024 * 1024);
  assert.equal(recorder.pauses, 1);
  pause.updatePendingBytes(8 * 1024 * 1024);
  pause.updatePendingBytes(0);
  assert.equal(recorder.resumes, 1);
});

test('stopping while paused freezes the duration and never resumes when writes finish', () => {
  const { recorder, pause, at } = setup();
  pause.toggleManual();
  at(1000);
  pause.stop();
  at(2000);
  pause.updatePendingBytes(0);
  pause.toggleManual();
  assert.equal(recorder.resumes, 0);
  assert.equal(pause.getPausedDuration(), 1000);
});

test('inactive recorder cannot be paused or resumed', () => {
  const { recorder, pause } = setup();
  recorder.state = 'inactive';
  pause.toggleManual();
  pause.updatePendingBytes(30 * 1024 * 1024);
  assert.equal(recorder.pauses, 0);
  assert.equal(recorder.resumes, 0);
});
