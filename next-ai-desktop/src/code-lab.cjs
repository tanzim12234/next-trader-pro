'use strict';

const vm = require('node:vm');

const LANGUAGES = new Set(['javascript', 'json', 'markdown', 'text']);

function validateCode(input) {
  if (!input || typeof input.code !== 'string' || input.code.length > 100000) {
    throw new Error('Code must be a string under 100 KB.');
  }
  const language = String(input.language || 'javascript').toLowerCase();
  if (!LANGUAGES.has(language)) throw new Error('Unsupported code language.');
  if (language === 'javascript') {
    // Compile only. Never run the generated source.
    new vm.Script(input.code, { filename: 'NEXT-proposal.js' });
    return { ok: true, language, checked: 'javascript-syntax-only', executed: false };
  }
  if (language === 'json') {
    JSON.parse(input.code);
    return { ok: true, language, checked: 'json-parse-only', executed: false };
  }
  return { ok: true, language, checked: 'size-and-text-only', executed: false };
}

module.exports = { validateCode, LANGUAGES };
