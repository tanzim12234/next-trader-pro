'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTaskStore } = require('../src/task-store.cjs');
const safeStorage = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value).toString('base64'), decryptString: value => Buffer.from(value.toString(), 'base64').toString() };
test('task history persists newest-first and limits to 50 entries', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-task-'));
  const store = createTaskStore(path.join(dir, 'history.enc'), safeStorage);
  for (let i = 0; i < 55; i++) store.add({ id: String(i), goal: 'Task ' + i, status: 'completed', completed: 1, total: 1 });
  const items = store.list();
  assert.equal(items.length, 50);
  assert.equal(items[0].id, '54');
  assert.equal(items[49].id, '5');
  fs.rmSync(dir, { recursive: true, force: true });
});
test('task history rejects empty goals and normalizes unsafe fields', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-task-'));
  const store = createTaskStore(path.join(dir, 'history.json'));
  assert.throws(() => store.add({ goal: '  ', status: 'completed' }));
  const item = store.add({ goal: '  test  ', status: 'unknown', completed: 99, total: 99 });
  assert.equal(item.goal, 'test');
  assert.equal(item.status, 'failed');
  assert.equal(item.completed, 6);
  fs.rmSync(dir, { recursive: true, force: true });
});
