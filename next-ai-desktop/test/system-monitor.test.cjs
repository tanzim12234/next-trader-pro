'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSystemMonitor, parseWindowsMetrics, WINDOWS_METRICS_SCRIPT } = require('../src/system-monitor.cjs');

test('parses disk, battery and network metrics from Windows PowerShell JSON', () => {
  const result = parseWindowsMetrics({
    disks: { name: 'C:', sizeBytes: 1000, freeBytes: 250 },
    batteries: [{ percent: 83, status: 2 }],
    networks: [{ name: 'Wi-Fi', receivedBytes: 1200, sentBytes: 450 }],
    gpus: [{ name: 'Example GPU' }],
    gpuPercent: 37
  });
  assert.equal(result.disks.length, 1);
  assert.equal(result.disks[0].name, 'C:');
  assert.equal(result.disks[0].freeBytes, 250);
  assert.equal(result.batteries[0].percent, 83);
  assert.equal(result.networks[0].receivedBytes, 1200);
  assert.equal(result.gpus[0].name, 'Example GPU');
  assert.equal(result.gpuPercent, 37);
});

test('normalizes empty and singleton PowerShell collections', () => {
  const result = parseWindowsMetrics({ disks: null, batteries: null, networks: { name: 'Ethernet', receivedBytes: 0, sentBytes: 0 } });
  assert.deepEqual(result.disks, []);
  assert.deepEqual(result.batteries, []);
  assert.equal(result.networks.length, 1);
});

test('clamps battery percentage to the valid range', () => {
  assert.equal(parseWindowsMetrics({ batteries: [{ percent: 140 }] }).batteries[0].percent, 100);
  assert.equal(parseWindowsMetrics({ batteries: [{ percent: -2 }] }).batteries[0].percent, 0);
});

test('does not execute PowerShell outside Windows', async () => {
  let called = false;
  const monitor = createSystemMonitor({ platform: 'linux', runPowerShell: async () => { called = true; return '{}'; } });
  const result = await monitor.getExtendedStats();
  assert.equal(called, false);
  assert.equal(result.detailsAvailable, false);
});

test('returns graceful fallback when Windows telemetry command fails', async () => {
  const monitor = createSystemMonitor({ platform: 'win32', runPowerShell: async () => { throw new Error('PowerShell unavailable'); } });
  const result = await monitor.getExtendedStats();
  assert.equal(result.detailsAvailable, false);
  assert.match(result.detailsError, /PowerShell unavailable/);
  assert.deepEqual(result.disks, []);
});

test('uses a fixed read-only PowerShell query without user-provided command text', () => {
  assert.match(WINDOWS_METRICS_SCRIPT, /Get-CimInstance Win32_LogicalDisk/);
  assert.match(WINDOWS_METRICS_SCRIPT, /Get-CimInstance Win32_Battery/);
  assert.match(WINDOWS_METRICS_SCRIPT, /Get-NetAdapterStatistics/);
  assert.doesNotMatch(WINDOWS_METRICS_SCRIPT, /Remove-Item|Set-ExecutionPolicy|Invoke-Expression/);
});

test('reports unavailable GPU utilization honestly when the counter is absent', () => {
  const result = parseWindowsMetrics({ gpus: [{ name: 'Example GPU' }], gpuPercent: null });
  assert.equal(result.gpus[0].name, 'Example GPU');
  assert.equal(result.gpuPercent, null);
});
