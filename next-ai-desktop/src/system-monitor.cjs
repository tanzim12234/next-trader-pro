'use strict';

const { execFile } = require('node:child_process');

const WINDOWS_METRICS_SCRIPT = [
  '$ErrorActionPreference = "Stop"',
  '$disks = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object { [pscustomobject]@{ name=$_.DeviceID; sizeBytes=[double]$_.Size; freeBytes=[double]$_.FreeSpace } })',
  '$batteries = @(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | ForEach-Object { [pscustomobject]@{ percent=$_.EstimatedChargeRemaining; status=$_.BatteryStatus } })',
  '$networks = @(Get-NetAdapterStatistics -ErrorAction SilentlyContinue | ForEach-Object { [pscustomobject]@{ name=$_.Name; receivedBytes=[double]$_.ReceivedBytes; sentBytes=[double]$_.SentBytes } })',
  '[pscustomobject]@{ disks=$disks; batteries=$batteries; networks=$networks } | ConvertTo-Json -Compress -Depth 4'
].join('; ');

function normalizeArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function parseWindowsMetrics(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return {
    disks: normalizeArray(data?.disks).map(d => ({
      name: String(d.name || ''),
      sizeBytes: Number(d.sizeBytes) || 0,
      freeBytes: Number(d.freeBytes) || 0
    })).filter(d => d.name && d.sizeBytes > 0),
    batteries: normalizeArray(data?.batteries).map(b => ({
      percent: Number.isFinite(Number(b.percent)) ? Math.max(0, Math.min(100, Number(b.percent))) : null,
      status: Number.isFinite(Number(b.status)) ? Number(b.status) : null
    })),
    networks: normalizeArray(data?.networks).map(n => ({
      name: String(n.name || ''),
      receivedBytes: Number(n.receivedBytes) || 0,
      sentBytes: Number(n.sentBytes) || 0
    })).filter(n => n.name)
  };
}

function createSystemMonitor(options = {}) {
  const platform = options.platform || process.platform;
  const run = options.runPowerShell || ((script) => new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 7000, maxBuffer: 1024 * 1024, encoding: 'utf8' },
      (error, stdout) => error ? reject(error) : resolve(stdout.trim()));
  }));

  async function getExtendedStats() {
    if (platform !== 'win32') return { disks: [], batteries: [], networks: [], detailsAvailable: false };
    try {
      const output = await run(WINDOWS_METRICS_SCRIPT);
      return { ...parseWindowsMetrics(output), detailsAvailable: true };
    } catch (error) {
      return { disks: [], batteries: [], networks: [], detailsAvailable: false, detailsError: String(error.message || error).slice(0, 180) };
    }
  }

  return { getExtendedStats };
}

module.exports = { createSystemMonitor, parseWindowsMetrics, WINDOWS_METRICS_SCRIPT };
