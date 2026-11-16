'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSelfHealing } = require('../src/self-healing.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'next-self-heal-'));
  const appPath = path.join(root, 'app');
  fs.mkdirSync(path.join(appPath, 'src'), { recursive: true });
  for (const name of ['main.cjs', 'index.html', 'preload.cjs']) {
    fs.writeFileSync(path.join(appPath, 'src', name), 'test');
  }
  return { root, appPath, selfHealing: createSelfHealing({ userDataPath: path.join(root, 'user-data') }) };
}

test('records runtime errors and exposes a bounded status summary', () => {
  const { selfHealing } = fixture();
  selfHealing.recordError({ source: 'renderer', message: 'Unexpected token', code: 'WINDOW_ERROR', stack: 'at app.js:1' });
  const status = selfHealing.getStatus();
  assert.equal(status.enabled, true);
  assert.equal(status.errorsRecorded, 1);
  assert.equal(status.lastError.source, 'renderer');
  assert.match(status.logPath, /self-heal\.log$/);
});

test('diagnostics pass when app files, writable storage, and secure storage exist', async () => {
  const { appPath, selfHealing } = fixture();
  const report = await selfHealing.runDiagnostics({ appPath, safeStorageAvailable: true, appVersion: '0.1.0' });
  assert.equal(report.healthy, true);
  assert.equal(report.checks.length, 5);
  assert.equal(report.recommendedActions.length, 0);
  assert.equal(selfHealing.getStatus().errorsRecorded, 1);
});

test('diagnostics report missing files and unavailable secure storage without modifying app files', async () => {
  const { root, selfHealing } = fixture();
  const report = await selfHealing.runDiagnostics({ appPath: path.join(root, 'missing-app'), safeStorageAvailable: false });
  assert.equal(report.healthy, false);
  assert.equal(report.checks.filter(check => !check.ok).length, 4);
  assert.equal(report.recommendedActions.length, 4);
});
