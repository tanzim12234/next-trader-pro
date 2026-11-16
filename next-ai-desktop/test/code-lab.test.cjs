'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCode } = require('../src/code-lab.cjs');

test('validates JavaScript syntax without executing the source', () => {
  const result = validateCode({ language: 'javascript', code: 'globalThis.__nextCodeRan = true; const answer = 42;' });
  assert.equal(result.ok, true);
  assert.equal(result.executed, false);
  assert.equal(globalThis.__nextCodeRan, undefined);
});

test('rejects invalid JavaScript syntax', () => {
  assert.throws(() => validateCode({ language: 'javascript', code: 'function {' }), /Unexpected token|Invalid/);
});

test('validates JSON proposals', () => {
  assert.equal(validateCode({ language: 'json', code: '{"ok":true}' }).ok, true);
  assert.throws(() => validateCode({ language: 'json', code: '{oops}' }));
});

test('rejects oversized code and unsupported languages', () => {
  assert.throws(() => validateCode({ language: 'javascript', code: 'x'.repeat(100001) }), /100 KB/);
  assert.throws(() => validateCode({ language: 'python', code: 'print(1)' }), /Unsupported/);
});
