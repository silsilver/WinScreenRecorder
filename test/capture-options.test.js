'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { profiles, normalizeVideoOptions, normalizeDuration } = require('../src/video-options');
const { createFfmpegProgressParser, createDownloadProgressReporter, formatSaveProgress } = require('../src/save-progress');
const { normalizeMicrophoneGain } = require('../src/audio-mix');
const { readDiskSpace, LOW_BYTES, CRITICAL_BYTES } = require('../src/disk-space');

test('profiles provide increasing bitrates and reject untrusted options', () => {
  assert.ok(profiles.light.videoBitsPerSecond < profiles.balanced.videoBitsPerSecond);
  assert.ok(profiles.high.videoBitsPerSecond > profiles.balanced.videoBitsPerSecond);
  for (const profile of Object.values(profiles)) assert.equal(normalizeVideoOptions(profile).frameRate, profile.frameRate);
  for (const value of [null, [], { frameRate: 300 }, { videoBitsPerSecond: '6000000' }]) assert.throws(() => normalizeVideoOptions(value));
  assert.equal(normalizeDuration(null), null);
  assert.equal(normalizeDuration(5000), 5000);
  assert.throws(() => normalizeDuration(-1));
});

test('progress parser handles split chunks, throttles duplicates and never invents completion', () => {
  const progress = [];
  const parse = createFfmpegProgressParser(10000, (value) => progress.push(value));
  parse('out_time_us=50');
  parse('00000\nout_time_us=5000000\nprogress=end\nout_time_us=12000000\n');
  assert.deepEqual(progress.map((value) => value.percent), [50, 99]);
  const unknown = [];
  createFfmpegProgressParser(null, (value) => unknown.push(value))('out_time_us=2000000\n');
  assert.equal(unknown[0].percent, null);
  assert.match(formatSaveProgress(unknown[0], 'Convirtiendo'), /2 s/);
});

test('disk levels distinguish low, critical and unknown space without reporting unknown as zero', async () => {
  for (const [bytes, level] of [[LOW_BYTES, 'normal'], [LOW_BYTES - 1, 'low'], [CRITICAL_BYTES - 1, 'critical']]) {
    const result = await readDiskSpace('test', async () => ({ bavail: BigInt(bytes), bsize: 1n }));
    assert.equal(result.level, level);
  }
  const unknown = await readDiskSpace('test', async () => { throw new Error('Unavailable'); });
  assert.equal(unknown.level, 'unknown');
  assert.equal(unknown.availableBytes, null);
});

test('download progress is throttled, supports missing content length and reserves completion for verification', () => {
  let time = 0;
  const known = [];
  const report = createDownloadProgressReporter(1000, (progress) => known.push(progress), () => time);
  report(100); report(200);
  time = 300; report(1000);
  assert.deepEqual(known.map((item) => item.percent), [10, 99]);
  const unknown = [];
  const reportUnknown = createDownloadProgressReporter(NaN, (progress) => unknown.push(progress), () => time);
  reportUnknown(100); time = 600; reportUnknown(200);
  assert.deepEqual(unknown.map((item) => item.receivedBytes), [100, 200]);
  assert.equal(unknown[1].percent, null);
});

test('microphone gain supports mute and amplification while rejecting invalid volume', () => {
  assert.equal(normalizeMicrophoneGain(0), 0);
  assert.equal(normalizeMicrophoneGain(2), 2);
  assert.throws(() => normalizeMicrophoneGain(-1));
  assert.throws(() => normalizeMicrophoneGain(NaN));
  assert.throws(() => normalizeMicrophoneGain(3));
});
