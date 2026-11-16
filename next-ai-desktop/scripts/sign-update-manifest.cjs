'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { canonicalManifest } = require('../src/update-manager.cjs');

const releaseDir = path.resolve(__dirname, '..', 'release');
const packageJson = require('../package.json');
const privatePem = process.env.NEXT_AI_UPDATE_PRIVATE_KEY;
if (!privatePem) throw new Error('NEXT_AI_UPDATE_PRIVATE_KEY is not configured.');
const privateKey = crypto.createPrivateKey(privatePem);
if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Update signing key must be Ed25519.');

const installers = fs.readdirSync(releaseDir).filter(name => /^NEXT-AI-Setup-.*\.exe$/i.test(name));
if (installers.length !== 1) throw new Error('Expected exactly one Windows installer in release/.');
const installerName = installers[0];
const installerPath = path.join(releaseDir, installerName);
const bytes = fs.readFileSync(installerPath);
const tag = 'next-ai-desktop-v' + packageJson.version;
const manifest = {
  version: packageJson.version,
  platform: 'win32',
  arch: 'x64',
  url: 'https://github.com/tanzim12234/next-trader-pro/releases/download/' + tag + '/' + installerName,
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  size: bytes.length,
  publishedAt: new Date().toISOString()
};
manifest.signature = crypto.sign(null, Buffer.from(canonicalManifest(manifest)), privateKey).toString('base64');
fs.writeFileSync(path.join(releaseDir, 'update-manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'w', mode: 0o600 });
process.stdout.write('Signed update manifest created for version ' + manifest.version + '.\n');
