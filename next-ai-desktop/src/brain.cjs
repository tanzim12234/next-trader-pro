const fs = require('node:fs');
const path = require('node:path');

/**
 * Encrypted, user-controlled long-term memory for NEXT AI.
 * Only explicit "remember" requests are persisted; ordinary chat is not silently stored.
 */
function createPersonalBrain({ app, safeStorage }) {
  const file = () => path.join(app.getPath('userData'), 'personal-brain.enc');
  function load() {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is unavailable.');
    try {
      const raw = fs.readFileSync(file());
      const parsed = JSON.parse(safeStorage.decryptString(raw));
      return Array.isArray(parsed.memories) ? parsed : { memories: [] };
    } catch (err) {
      if (err.code === 'ENOENT') return { memories: [] };
      if (err instanceof SyntaxError) return { memories: [] };
      throw err;
    }
  }
  function save(data) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is unavailable.');
    const tmp = file() + '.tmp';
    fs.writeFileSync(tmp, safeStorage.encryptString(JSON.stringify(data)), { mode: 0o600 });
    fs.renameSync(tmp, file());
  }
  function remember(text, category = 'general') {
    if (typeof text !== 'string' || !text.trim() || text.length > 1000) throw new Error('Memory must be 1–1000 characters.');
    const data = load();
    const value = text.trim();
    const existing = data.memories.find(m => m.text.toLowerCase() === value.toLowerCase());
    if (existing) { existing.updatedAt = new Date().toISOString(); save(data); return existing; }
    const item = { id: require('node:crypto').randomUUID(), text: value, category: String(category).slice(0, 40), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    data.memories.unshift(item);
    data.memories = data.memories.slice(0, 500);
    save(data);
    return item;
  }
  function list(query = '') {
    const q = String(query).trim().toLowerCase();
    return load().memories.filter(m => !q || (m.text + ' ' + m.category).toLowerCase().includes(q)).slice(0, 100);
  }
  function forget(id) {
    const data = load();
    const before = data.memories.length;
    data.memories = data.memories.filter(m => m.id !== id);
    save(data);
    return { deleted: before - data.memories.length };
  }
  function clear() { save({ memories: [] }); return { cleared: true }; }
  function context(query) {
    const words = String(query || '').toLowerCase().split(/[^a-z0-9\u0980-\u09ff]+/).filter(w => w.length > 2);
    const memories = load().memories;
    const ranked = memories.map(m => ({ m, score: words.reduce((n, w) => n + ((m.text + ' ' + m.category).toLowerCase().includes(w) ? 1 : 0), 0) }))
      .filter(x => x.score > 0).sort((a,b) => b.score - a.score).slice(0, 12).map(x => x.m);
    const selected = ranked.length ? ranked : memories.slice(0, 8);
    return selected.map(m => '- ' + m.text).join('\n');
  }
  return { remember, list, forget, clear, context };
}
module.exports = { createPersonalBrain };
