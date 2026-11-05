const fs = require('node:fs');
const path = require('node:path');
const source = path.join(__dirname, '..', 'web');
const target = path.join(__dirname, '..', 'www');
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.cpSync(source, target, { recursive: true });
console.log('Android web assets copied.');
