'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  buildErrorAnalysisInput, parseAnalysis, buildRepairPrompt, parseRepairProposal
} = require('../src/repair-engine.cjs');
const {
  canonicalManifest, verifyUpdateManifest, verifyInstallerBytes
} = require('../src/update-manager.cjs');

test('diagnostic input redacts common API key formats', () => {
  const result = buildErrorAnalysisInput({ source: 'renderer', message: 'bad key AIza123456789012345678901234567890 and gsk_abcdefghijklmnopqrstuvwxyz123456' });
  assert.doesNotMatch(result.error.message, /AIza|gsk_/);
  assert.match(result.error.message, /REDACTED_API_KEY/);
});

test('analysis parser validates structure and marks human approval required', () => {
  const result = parseAnalysis(JSON.stringify({ summary: 'Crash', rootCause: 'Null reference', confidence: 'high', steps: ['Check element'], risks: ['Could recur'] }));
  assert.equal(result.requiresHumanApproval, true);
  assert.equal(result.codeWasExecuted, false);
  assert.throws(() => parseAnalysis('not json'), /invalid diagnostic JSON/);
});

test('repair proposal is restricted to approved paths and remains review-only', () => {
  assert.throws(() => buildRepairPrompt({ summary: 'x' }, 'code', '../evil.js'), /approved/);
  const input = buildRepairPrompt({ summary: 'Fix', rootCause: 'Null check' }, 'module.exports=1', 'src/app.cjs');
  assert.equal(input.path, 'src/app.cjs');
  const proposal = parseRepairProposal(JSON.stringify({ path: 'src/app.cjs', explanation: 'Add guard', content: 'module.exports=2' }), input.path);
  assert.equal(proposal.requiresReview, true);
  assert.equal(proposal.autoApplied, false);
  assert.equal(proposal.codeWasExecuted, false);
  assert.throws(() => parseRepairProposal(JSON.stringify({ path: '../evil.js', content: 'x' }), input.path), /invalid/);
});

test('signed update manifest and installer hash are verified', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const bytes = Buffer.from('installer-binary-test');
  const manifest = {
    version: '1.2.3', platform: 'win32', arch: 'x64',
    url: 'https://github.com/example/repo/releases/download/v1.2.3/setup.exe',
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length, publishedAt: '2026-11-16T10:00:00.000Z'
  };
  manifest.signature = crypto.sign(null, Buffer.from(canonicalManifest(manifest)), privateKey).toString('base64');
  assert.equal(verifyUpdateManifest(manifest, publicKey, { platform: 'win32', arch: 'x64' }).trusted, true);
  assert.equal(verifyInstallerBytes(bytes, manifest).verified, true);
  assert.throws(() => verifyInstallerBytes(Buffer.from('tampered'), manifest), /size verification/);
  const forged = { ...manifest, version: '9.9.9' };
  assert.throws(() => verifyUpdateManifest(forged, publicKey), /signature verification/);
});

test('updates remain disabled when no trusted public key is configured', () => {
  const manifest = {
    version: '1.2.3', platform: 'win32', arch: 'x64',
    url: 'https://github.com/example/repo/releases/download/v1.2.3/setup.exe',
    sha256: 'a'.repeat(64), size: 100, publishedAt: '2026-11-16T10:00:00.000Z',
    signature: Buffer.from('dummy').toString('base64')
  };
  assert.equal(verifyUpdateManifest(manifest, null).reason, 'UPDATE_PUBLIC_KEY_NOT_CONFIGURED');
});
