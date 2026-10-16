'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEncoderPolicy } = require('../src/video-encoder');
test('encoder selection probes once and retires a failing hardware encoder', async () => {
  const probes = []; const conversions = [];
  const policy = createEncoderPolicy({ probe: async (name) => { probes.push(name); return name === 'h264_nvenc'; } });
  await policy.encode(async (name) => { conversions.push(name); if (name !== 'libopenh264') throw new Error('Driver lost'); });
  assert.deepEqual(probes, ['h264_qsv', 'h264_nvenc']);
  assert.deepEqual(conversions, ['h264_nvenc', 'libopenh264']);
  await policy.encode(async (name) => assert.equal(name, 'libopenh264'));
  assert.equal(probes.length, 2); assert.equal(policy.status().accelerated, false);
});
test('cancellation does not retry in software or poison the hardware selection', async () => {
  const policy = createEncoderPolicy({ probe: async () => true });
  let calls = 0;
  await assert.rejects(policy.encode(async () => { calls++; throw new Error('Cancelled'); }, () => true), /Cancelled/);
  assert.equal(calls, 1); assert.equal(policy.status().accelerated, true);
});
test('a cancelled capability probe can be retried', async () => {
  let cancelled = true;
  const policy = createEncoderPolicy({ probe: async () => { if (cancelled) throw new Error('Cancelled'); return false; } });
  await assert.rejects(policy.encode(async () => {}), /Cancelled/);
  cancelled = false;
  await policy.encode(async (name) => assert.equal(name, 'libopenh264'));
  assert.equal(policy.status().checked, true);
});
test('unrelated disk and input errors do not cause a second complete conversion', async () => {
  const policy = createEncoderPolicy({ probe: async () => true });
  for (const message of ['No space left on device', 'Permission denied', 'Error opening input file']) {
    let calls = 0;
    await assert.rejects(policy.encode(async () => { calls++; throw new Error(message); }), (error) => error.message === message);
    assert.equal(calls, 1);
  }
});
