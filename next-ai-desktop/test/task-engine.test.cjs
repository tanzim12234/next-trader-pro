const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTaskPlan, validateTaskStep } = require('../src/task-engine.cjs');
test('normalizes only supported task actions', () => {
  const plan = normalizeTaskPlan({ steps: [
    { title: 'Open Notepad', action: { type: 'open-app', app: 'notepad' } },
    { title: 'Search a topic', action: { type: 'youtube-search', query: 'AI research' } }
  ] });
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.steps[0].action.app, 'notepad');
});
test('drops unsupported or malformed AI-proposed actions', () => {
  const plan = normalizeTaskPlan({ steps: [
    { title: 'Run shell', action: { type: 'shell', command: 'whoami' } },
    { title: 'Open Calculator', action: { type: 'open-app', app: 'calculator' } }
  ] });
  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0].action.app, 'calculator');
});
test('rejects unsafe URL protocols and credential-bearing URLs', () => {
  assert.throws(() => validateTaskStep({ type: 'open-url', url: 'file:///C:/Windows' }), /HTTP or HTTPS/);
  assert.throws(() => validateTaskStep({ type: 'open-url', url: 'https://user:pass@example.com' }), /HTTP or HTTPS/);
  assert.equal(validateTaskStep({ type: 'open-url', url: 'https://example.com' }).url, 'https://example.com/');
});
test('rejects arbitrary commands and unknown applications', () => {
  assert.throws(() => validateTaskStep({ type: 'shell', command: 'del *' }), /not supported/);
  assert.throws(() => validateTaskStep({ type: 'open-app', app: 'powershell' }), /allowlist/);
});
test('allows only fixed Windows desktop utilities from the shared allowlist', () => {
  for (const app of ['task-manager', 'snipping-tool', 'paint']) {
    assert.equal(validateTaskStep({ type: 'open-app', app }).app, app);
  }
  assert.throws(() => validateTaskStep({ type: 'open-app', app: 'powershell' }), /allowlist/);
});
test('limits task plans to six validated steps', () => {
  const steps = Array.from({ length: 8 }, (_, i) => ({ title: 'Open app ' + i, action: { type: 'open-app', app: 'notepad' } }));
  assert.equal(normalizeTaskPlan({ steps }).steps.length, 6);
});
