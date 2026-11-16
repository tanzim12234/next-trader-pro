'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function safeMessage(value, limit = 4000) {
  return String(value || 'Unknown error')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[REDACTED_API_KEY]')
    .replace(/\bgsk_[A-Za-z0-9]{20,}\b/g, '[REDACTED_API_KEY]')
    .replace(/(api[_-]?key|authorization|bearer)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, limit);
}

function createSelfHealing(options = {}) {
  const userDataPath = path.resolve(options.userDataPath || path.join(os.tmpdir(), 'next-ai-self-heal'));
  const logDir = path.join(userDataPath, 'diagnostics');
  const logPath = path.join(logDir, 'self-heal.log');
  const maxLogBytes = 1024 * 1024;

  function ensureLogDir() {
    fs.mkdirSync(logDir, { recursive: true });
  }

  function recordError(input = {}) {
    ensureLogDir();
    let currentSize = 0;
    try { currentSize = fs.statSync(logPath).size; } catch {}
    if (currentSize > maxLogBytes) {
      const previous = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean).slice(-150);
      fs.writeFileSync(logPath, previous.join('\n') + '\n', 'utf8');
    }
    const entry = {
      at: new Date().toISOString(),
      source: safeMessage(input.source || 'application', 80),
      message: safeMessage(input.message),
      code: safeMessage(input.code || '', 120),
      stack: safeMessage(input.stack || '', 12000)
    };
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', { encoding: 'utf8', mode: 0o600 });
    return { ok: true, at: entry.at };
  }

  function getStatus() {
    let entries = [];
    try {
      entries = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean).slice(-100).map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
    } catch {}
    const actualErrors = entries.filter(entry => entry.source !== 'diagnostics' && entry.source !== 'ai-analysis' && entry.code !== 'DIAGNOSTICS_OK');
    return {
      enabled: true,
      errorsRecorded: actualErrors.length,
      lastError: actualErrors.length ? actualErrors[actualErrors.length - 1] : null,
      recentErrors: actualErrors.slice(-20),
      logPath
    };
  }

  async function runDiagnostics(input = {}) {
    const checks = [];
    const checkPath = (label, target) => checks.push({
      label,
      ok: Boolean(target && fs.existsSync(target)),
      detail: target ? path.basename(target) : 'Path unavailable'
    });
    checkPath('Application entry point', path.join(input.appPath || '', 'src', 'main.cjs'));
    checkPath('Renderer interface', path.join(input.appPath || '', 'src', 'index.html'));
    checkPath('Secure preload bridge', path.join(input.appPath || '', 'src', 'preload.cjs'));

    try {
      ensureLogDir();
      const probe = path.join(logDir, '.write-test-' + process.pid);
      fs.writeFileSync(probe, 'ok', { flag: 'w' });
      fs.unlinkSync(probe);
      checks.push({ label: 'Diagnostics storage', ok: true, detail: 'Writable' });
    } catch (error) {
      checks.push({ label: 'Diagnostics storage', ok: false, detail: safeMessage(error.message, 300) });
    }

    checks.push({
      label: 'Secure storage',
      ok: input.safeStorageAvailable === true,
      detail: input.safeStorageAvailable === true ? 'Available' : 'Unavailable; encrypted settings may not work'
    });

    const failed = checks.filter(check => !check.ok);
    const report = {
      at: new Date().toISOString(),
      platform: safeMessage(input.platform || process.platform, 80),
      appVersion: safeMessage(input.appVersion || 'unknown', 80),
      electronVersion: safeMessage(input.electronVersion || 'unknown', 80),
      nodeVersion: safeMessage(input.nodeVersion || process.versions.node, 80),
      checks,
      healthy: failed.length === 0,
      recommendedActions: failed.map(check => ({
        check: check.label,
        action: check.label === 'Diagnostics storage'
          ? 'Check Windows permissions and free disk space for the NEXT AI user-data folder.'
          : check.label === 'Secure storage'
            ? 'Restart NEXT AI under the normal signed-in Windows user account and check Windows credential services.'
            : 'Run the installer repair/reinstall process; application files may be missing.'
      }))
    };
    recordError({
      source: 'diagnostics',
      message: report.healthy ? 'Startup diagnostics passed.' : 'Startup diagnostics found ' + failed.length + ' issue(s).',
      code: report.healthy ? 'DIAGNOSTICS_OK' : 'DIAGNOSTICS_WARNING'
    });
    return report;
  }

  return Object.freeze({ recordError, getStatus, runDiagnostics, logPath });
}

module.exports = { createSelfHealing };
