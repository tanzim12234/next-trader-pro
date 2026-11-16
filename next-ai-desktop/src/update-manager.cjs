'use strict';

const crypto = require('node:crypto');

const MAX_MANIFEST_BYTES = 32 * 1024;
const MAX_INSTALLER_BYTES = 500 * 1024 * 1024;
const RELEASE_HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);

function canonicalManifest(manifest) {
  return JSON.stringify({
    version: manifest.version,
    platform: manifest.platform,
    arch: manifest.arch,
    url: manifest.url,
    sha256: manifest.sha256,
    size: manifest.size,
    publishedAt: manifest.publishedAt
  });
}

function validateManifestShape(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Invalid update manifest.');
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) throw new Error('Invalid update version.');
  if (manifest.platform !== 'win32' || !['x64', 'arm64'].includes(manifest.arch)) throw new Error('Unsupported update platform.');
  if (typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(manifest.sha256)) throw new Error('Invalid installer SHA-256.');
  if (!Number.isSafeInteger(manifest.size) || manifest.size < 1 || manifest.size > MAX_INSTALLER_BYTES) throw new Error('Invalid installer size.');
  if (typeof manifest.publishedAt !== 'string' || Number.isNaN(Date.parse(manifest.publishedAt))) throw new Error('Invalid publication timestamp.');
  let url;
  try { url = new URL(manifest.url); } catch { throw new Error('Invalid installer URL.'); }
  if (url.protocol !== 'https:' || !RELEASE_HOSTS.has(url.hostname) || url.username || url.password) throw new Error('Installer must use a trusted HTTPS release host.');
  if (typeof manifest.signature !== 'string' || manifest.signature.length > 2048) throw new Error('Missing update signature.');
  return true;
}

function verifyUpdateManifest(manifest, publicKey, expected = {}) {
  validateManifestShape(manifest);
  if (!publicKey) return { trusted: false, reason: 'UPDATE_PUBLIC_KEY_NOT_CONFIGURED' };
  if (expected.platform && manifest.platform !== expected.platform) throw new Error('Update platform mismatch.');
  if (expected.arch && manifest.arch !== expected.arch) throw new Error('Update architecture mismatch.');
  const signature = Buffer.from(manifest.signature, 'base64');
  if (!signature.length || signature.length > 1024) throw new Error('Invalid update signature encoding.');
  const valid = crypto.verify(null, Buffer.from(canonicalManifest(manifest)), publicKey, signature);
  if (!valid) throw new Error('Update manifest signature verification failed.');
  return { trusted: true, manifest: { ...manifest, signature: undefined } };
}

function verifyInstallerBytes(bytes, manifest) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== manifest.size) throw new Error('Installer size verification failed.');
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (digest.toLowerCase() !== manifest.sha256.toLowerCase()) throw new Error('Installer SHA-256 verification failed.');
  return { verified: true, sha256: digest, size: bytes.length };
}

module.exports = { canonicalManifest, validateManifestShape, verifyUpdateManifest, verifyInstallerBytes };
