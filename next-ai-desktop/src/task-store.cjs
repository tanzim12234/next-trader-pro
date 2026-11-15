'use strict';
const fs = require('node:fs');
const path = require('node:path');
function createTaskStore(filePath) {
  function read() {
    try {
      const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string').slice(0, 50) : [];
    } catch { return []; }
  }
  function list() { return read(); }
  function add(entry) {
    if (!entry || typeof entry.goal !== 'string' || typeof entry.status !== 'string') throw new Error('Invalid task history entry.');
    const safe = {
      id: typeof entry.id === 'string' ? entry.id.slice(0, 80) : String(Date.now()),
      goal: entry.goal.trim().slice(0, 1500),
      status: ['completed', 'cancelled', 'failed'].includes(entry.status) ? entry.status : 'failed',
      completed: Number.isInteger(entry.completed) ? Math.max(0, Math.min(6, entry.completed)) : 0,
      total: Number.isInteger(entry.total) ? Math.max(0, Math.min(6, entry.total)) : 0,
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt.slice(0, 40) : new Date().toISOString()
    };
    if (!safe.goal) throw new Error('Task goal is required.');
    const items = [safe, ...read()].slice(0, 50);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2), { mode: 0o600 });
    return safe;
  }
  return { list, add };
}
module.exports = { createTaskStore };
