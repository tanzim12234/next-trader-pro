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
    'the','and','for','with','that','this','what','when','where','which','who','whom','how','are','was','were','you','your','about','from','have','has','had','will','would','could','should','can','does','did','not','but','into','then',
    'আমার','তোমার','তুমি','আমি','এটা','ওটা','কি','কী','কেন','কিভাবে','হবে','হয়','হয়','করো','করতে','একটা','এবং','অথবা','জন্য','থেকে','নিয়ে','নিয়ে','হলো','হল','আছে','আছি','ছিল'
  ]);

  // Small bilingual concept map improves retrieval without sending private memories to an embedding API.
  const conceptGroups = [
    ['বাংলা','বাংলায়','বাংলায়','bangla','bengali'],
    ['মেমরি','মেমোরি','স্মৃতি','মনে','memory','memories'],
    ['শেখা','শিখে','শিখতে','শেখাও','learning','learn','learnt'],
    ['পছন্দ','পছন্দের','ভালোবাসা','preference','prefer','favorite','favourite'],
    ['প্রকল্প','প্রজেক্ট','project'],
    ['ট্রেডিং','trading','ব্যবসা','trade'],
    ['কাজ','কর্ম','workflow','work','task'],
    ['কথা','বল','ভাষা','language','speak','speaking']
  ];
  const conceptMap = new Map();
  for (const group of conceptGroups) {
    const normalized = group.map(value => value.toLocaleLowerCase());
    for (const value of normalized) conceptMap.set(value, normalized);
  }
  const bnSuffixes = ['গুলো','গুলি','দেরকে','গুলোর','গুলিতে','গুলা','গুলোতে','দের','টির','টির','টিরও','টা','টি','তে','কে','রা','য়','য়ে','ের','র'];
  function normalizeToken(word) {
    let value = word.toLocaleLowerCase();
    if (/^[a-z]+$/u.test(value)) {
      if (value.length > 5 && value.endsWith('ies')) value = value.slice(0, -3) + 'y';
      else if (value.length > 5 && value.endsWith('ing')) value = value.slice(0, -3);
      else if (value.length > 4 && value.endsWith('ed')) value = value.slice(0, -2);
      else if (value.length > 4 && value.endsWith('s') && !value.endsWith('ss')) value = value.slice(0, -1);
    } else if (/[\u0980-\u09ff]/u.test(value)) {
      for (const suffix of bnSuffixes) {
        if (value.endsWith(suffix) && [...value].length - [...suffix].length >= 2) {
          value = value.slice(0, -suffix.length);
          break;
        }
      }
    }
    return value;
  }
  function tokens(value) {
    return String(value || '').toLocaleLowerCase()
      .split(/[^a-z0-9\u0980-\u09ff]+/u)
      .map(normalizeToken)
      .filter(word => word.length > 1 && !stopWords.has(word));
  }
  function expandTerms(terms) {
    const expanded = new Set(terms);
    for (const term of terms) {
      const group = conceptMap.get(term);
      if (group) for (const alias of group) expanded.add(normalizeToken(alias));
    }
    return [...expanded];
  }
  function scoreMemory(queryTerms, phrase, memory, corpus) {
    const docTerms = tokens(memory.text);
    const frequencies = new Map();
    for (const term of docTerms) frequencies.set(term, (frequencies.get(term) || 0) + 1);
    const categoryTerms = new Set(tokens(memory.category));
    const averageLength = corpus.length
      ? corpus.reduce((sum, item) => sum + tokens(item.text).length, 0) / corpus.length
      : 1;
    const docLength = docTerms.length || 1;
    let score = 0;
    let matched = 0;
    for (const term of queryTerms) {
      const tf = frequencies.get(term) || 0;
      if (tf) {
        matched += 1;
        const df = corpus.reduce((count, item) => count + (tokens(item.text).includes(term) ? 1 : 0), 0);
        const idf = Math.log(1 + (corpus.length - df + 0.5) / (df + 0.5));
        const saturation = (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * docLength / averageLength));
        score += idf * saturation;
      }
      if (categoryTerms.has(term)) score += 0.35;
    }
    const normalizedPhrase = tokens(phrase).join(' ');
    const normalizedText = docTerms.join(' ');
    if (normalizedPhrase.length > 3 && normalizedText.includes(normalizedPhrase)) score += 2.5;
    // Exact unstemmed phrase and freshness are tie-breakers, never independent matches.
    if (phrase.length > 3 && String(memory.text || '').toLocaleLowerCase().includes(phrase)) score += 1.5;
    const updated = Date.parse(memory.updatedAt || memory.createdAt || 0);
    const ageDays = Number.isFinite(updated) ? Math.max(0, (Date.now() - updated) / 86400000) : 365;
    score += Math.max(0, 0.15 - ageDays / 36500);
    return { score, matched };
  }
  function rank(query, memories) {
    const rawTerms = tokens(query);
    if (!rawTerms.length) return [];
    const queryTerms = expandTerms(rawTerms);
    const phrase = String(query).trim().toLocaleLowerCase();
    return memories.map((memory, index) => {
      const result = scoreMemory(queryTerms, phrase, memory, memories);
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
  function ingest(text, category = 'knowledge') {
    if (typeof text !== 'string' || !text.trim()) throw new Error('Knowledge text is required.');
    if (text.length > 50000) throw new Error('Knowledge text must be 50,000 characters or less.');
    const normalized = text.replace(/\r\n/g, '\n').trim();
    // Split at paragraph/sentence boundaries, then cap each searchable memory at 900 chars.
    const units = normalized.split(/\n{2,}|(?<=[.!?।])\s+/u).map(part => part.trim()).filter(Boolean);
    const chunks = [];
    let current = '';
    for (const unit of units) {
      if (unit.length > 900) {
        if (current) { chunks.push(current); current = ''; }
        for (let i = 0; i < unit.length; i += 900) chunks.push(unit.slice(i, i + 900));
        continue;
      }
      if (current && (current.length + unit.length + 1) > 900) { chunks.push(current); current = unit; }
      else current = current ? current + '\n' + unit : unit;
    }
    if (current) chunks.push(current);
    if (chunks.length > 60) throw new Error('This lesson creates too many chunks (maximum 60).');
    const saved = chunks.map((chunk, index) => remember(
      chunks.length > 1 ? '[Lesson ' + (index + 1) + '/' + chunks.length + '] ' + chunk : chunk,
      String(category || 'knowledge').slice(0, 40)
    ));
    return { saved: saved.length, memories: saved };
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
  return { remember, ingest, list, forget, clear, context };
}
module.exports = { createPersonalBrain };
