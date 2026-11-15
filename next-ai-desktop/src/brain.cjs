const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/**
 * Encrypted, user-controlled long-term memory.
 * No chat is silently stored: memories are added only by an explicit remember action.
 */
function createPersonalBrain({ app, safeStorage }) {
  const file = () => path.join(app.getPath('userData'), 'personal-brain.enc');
  function load() {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is unavailable.');
    try {
      const parsed = JSON.parse(safeStorage.decryptString(fs.readFileSync(file())));
      return Array.isArray(parsed.memories) ? parsed : { memories: [] };
    } catch (err) {
      // A missing file means first run; corrupted or undecryptable data must never be silently overwritten.
      if (err.code === 'ENOENT') return { memories: [] };
      throw err;
    }
  }
  function save(data) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is unavailable.');
    const target = file();
    const tmp = target + '.tmp';
    fs.writeFileSync(tmp, safeStorage.encryptString(JSON.stringify(data)), { mode: 0o600 });
    fs.renameSync(tmp, target);
  }
  function remember(text, category = 'general') {
    if (typeof text !== 'string' || !text.trim() || text.length > 1000) throw new Error('Memory must be 1–1000 characters.');
    const data = load();
    const value = text.trim();
    const existing = data.memories.find(m => m.text.toLowerCase() === value.toLowerCase());
    if (existing) {
      existing.updatedAt = new Date().toISOString();
      if (category) existing.category = String(category).slice(0, 40);
      save(data);
      return existing;
    }
    const now = new Date().toISOString();
    const item = { id: crypto.randomUUID(), text: value, category: String(category).slice(0, 40), createdAt: now, updatedAt: now };
    data.memories.unshift(item);
    data.memories = data.memories.slice(0, 500);
    save(data);
    return item;
  }

  const stopWords = new Set([
    'the','and','for','with','that','this','what','when','where','which','who','whom','how','are','was','were','you','your','about','from','have','has','had','will','would','could','should','can',
    'আমার','তোমার','তুমি','আমি','এটা','ওটা','কি','কী','কেন','কিভাবে','হবে','হয়','হয়','করো','করতে','একটা','এবং','অথবা','জন্য','থেকে','নিয়ে','নিয়ে'
  ]);
  function tokens(value) {
    return [...new Set(String(value || '').toLocaleLowerCase()
      .split(/[^a-z0-9\u0980-\u09ff]+/u)
      .filter(word => word.length > 1 && !stopWords.has(word)))];
  }
  function scoreMemory(queryTerms, phrase, memory) {
    const text = (memory.text || '').toLocaleLowerCase();
    const category = (memory.category || '').toLocaleLowerCase();
    let score = 0;
    let matched = 0;
    for (const term of queryTerms) {
      if (text.includes(term)) { score += term.length > 4 ? 3 : 2; matched += 1; }
      if (category.includes(term)) score += 1;
    }
    if (phrase.length > 3 && text.includes(phrase)) score += 6;
    // A small recency tie-breaker; it never makes an unrelated memory match.
    const updated = Date.parse(memory.updatedAt || memory.createdAt || 0);
    const ageDays = Number.isFinite(updated) ? Math.max(0, (Date.now() - updated) / 86400000) : 365;
    score += Math.max(0, 0.5 - ageDays / 3650);
    return { score, matched };
  }
  function rank(query, memories) {
    const terms = tokens(query);
    if (!terms.length) return [];
    const phrase = String(query).trim().toLocaleLowerCase();
    return memories.map((memory, index) => {
      const result = scoreMemory(terms, phrase, memory);
      return { memory, score: result.score, matched: result.matched, index };
    }).filter(item => item.matched > 0)
      .sort((a, b) => b.score - a.score || b.matched - a.matched || b.index - a.index)
      .map(item => item.memory);
  }
  function relatedTo(seedMemories, allMemories, excludedIds) {
    const seedTerms = new Set(seedMemories.flatMap(m => tokens(m.text)));
    const related = allMemories.map((memory, index) => {
      if (excludedIds.has(memory.id)) return null;
      const shared = tokens(memory.text).filter(term => seedTerms.has(term)).length;
      return { memory, shared, index };
    }).filter(item => item && item.shared >= 2)
      .sort((a, b) => b.shared - a.shared || b.index - a.index);
    return related.map(item => item.memory);
  }
  function list(query = '') {
    const memories = load().memories;
    const q = String(query).trim();
    return (q ? rank(q, memories) : memories).slice(0, 100);
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
    const memories = load().memories;
    const direct = rank(query, memories).slice(0, 5);
    if (!direct.length) return '';
    // Expand only from terms in directly matched memories; unrelated memories never enter context.
    const ids = new Set(direct.map(m => m.id));
    const related = relatedTo(direct, memories, ids).slice(0, 3);
    const lines = [
      'Directly relevant saved memories:',
      ...direct.map(m => '- [' + (m.category || 'general') + '] ' + m.text)
    ];
    if (related.length) {
      lines.push('Related saved memories (linked by shared topics):');
      lines.push(...related.map(m => '- [' + (m.category || 'general') + '] ' + m.text));
    }
    return lines.join('\n').slice(0, 6000);
  }
  return { remember, list, forget, clear, context };
}
module.exports = { createPersonalBrain };
