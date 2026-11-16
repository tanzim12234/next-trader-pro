const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPersonalBrain } = require('../src/brain.cjs');

(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'next-ai-semantic-runtime-'));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(value, 'utf8'),
    decryptString: value => Buffer.from(value).toString('utf8')
  };

  try {
    const brain = createPersonalBrain({
      app: { getPath: () => userData },
      safeStorage
    });
    const saved = brain.remember('আমি গাড়ি চালাতে এবং নতুন জায়গায় ভ্রমণ করতে ভালোবাসি', 'preference');
    brain.remember('চকলেট কেক বানাতে কোকো পাউডার লাগে', 'food');

    const results = await brain.search('vehicle transportation and travel');
    assert.ok(results.length > 0, 'The real multilingual embedding model should return a semantic match.');
    assert.equal(results[0].id, saved.id, 'The English query should retrieve the Bengali vehicle memory.');
    assert.ok(fs.existsSync(path.join(userData, 'personal-brain-vectors.enc')), 'Encrypted vector cache should be written.');

    console.log('PASS: real multilingual embedding model loaded and ran on Windows.');
    console.log('PASS: English query retrieved Bengali memory.');
    console.log('PASS: encrypted vector cache was written.');
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
