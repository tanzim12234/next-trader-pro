const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/**
 * Encrypted local long-term memory. Stable, non-sensitive facts may be learned automatically;
 * secrets and sensitive personal data are filtered before automatic ingestion.
 */
function createPersonalBrain({ app, safeStorage, semanticEmbedder }) {
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
  function rank(query, memories) {
    const rawTerms = tokens(query);
    if (!rawTerms.length) return [];
    const queryTerms = expandTerms(rawTerms);
    const phrase = String(query).trim().toLocaleLowerCase();
    const normalizedPhrase = tokens(phrase).join(' ');
    const indexed = memories.map((memory, index) => {
      const terms = tokens(memory.text);
      const frequencies = new Map();
      for (const term of terms) frequencies.set(term, (frequencies.get(term) || 0) + 1);
      return {
        memory, index, terms, frequencies,
        categoryTerms: new Set(tokens(memory.category)),
        normalizedText: terms.join(' '),
        updated: Date.parse(memory.updatedAt || memory.createdAt || 0)
      };
    });
    const documentFrequency = new Map();
    for (const item of indexed) {
      for (const term of item.frequencies.keys()) documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
    const averageLength = indexed.length
      ? indexed.reduce((sum, item) => sum + item.terms.length, 0) / indexed.length
      : 1;
    return indexed.map(item => {
      let score = 0;
      let matched = 0;
      const docLength = item.terms.length || 1;
      for (const term of queryTerms) {
        const tf = item.frequencies.get(term) || 0;
        if (tf) {
          matched += 1;
          const df = documentFrequency.get(term) || 0;
          const idf = Math.log(1 + (indexed.length - df + 0.5) / (df + 0.5));
          const saturation = (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * docLength / Math.max(averageLength, 1)));
          score += idf * saturation;
        }
        if (item.categoryTerms.has(term)) score += 0.35;
      }
      if (normalizedPhrase.length > 3 && item.normalizedText.includes(normalizedPhrase)) score += 2.5;
      if (phrase.length > 3 && String(item.memory.text || '').toLocaleLowerCase().includes(phrase)) score += 1.5;
      const ageDays = Number.isFinite(item.updated) ? Math.max(0, (Date.now() - item.updated) / 86400000) : 365;
      score += Math.max(0, 0.15 - ageDays / 36500);
      return { memory: item.memory, score, matched, index: item.index };
    }).filter(item => item.matched > 0)
      .sort((a, b) => b.score - a.score || b.matched - a.matched || b.index - a.index)
      .map(item => item.memory);
  }
  function conceptIds(value) {
    const ids = new Set();
    for (const term of tokens(value)) {
      const group = conceptMap.get(term);
      if (group) ids.add(group[0]);
    }
    return ids;
  }
  function buildKnowledgeGraph(memories) {
    const nodes = memories.map(memory => ({
      id: memory.id,
      label: String(memory.text || '').slice(0, 140),
      category: memory.category || 'general'
    }));
    const edges = [];
    const indexed = memories.map(memory => ({
      id: memory.id,
      terms: new Set(tokens(memory.text)),
      concepts: conceptIds(memory.text)
    }));
    for (let i = 0; i < indexed.length; i++) {
      for (let j = i + 1; j < indexed.length; j++) {
        const sharedTerms = [...indexed[i].terms].filter(term => indexed[j].terms.has(term));
        const sharedConcepts = [...indexed[i].concepts].filter(term => indexed[j].concepts.has(term));
        if (sharedTerms.length < 2 && !(sharedTerms.length >= 1 && sharedConcepts.length >= 1)) continue;
        edges.push({
          source: indexed[i].id,
          target: indexed[j].id,
          weight: sharedTerms.length + sharedConcepts.length * 1.5,
          topics: [...sharedConcepts, ...sharedTerms].slice(0, 8)
        });
        if (edges.length >= 2000) return { nodes, edges };
      }
    }
    return { nodes, edges };
  }
  function relatedTo(seedMemories, allMemories, excludedIds) {
    const graph = buildKnowledgeGraph(allMemories);
    const weights = new Map();
    for (const edge of graph.edges) {
      if (excludedIds.has(edge.source) && !excludedIds.has(edge.target)) {
        weights.set(edge.target, (weights.get(edge.target) || 0) + edge.weight);
      } else if (excludedIds.has(edge.target) && !excludedIds.has(edge.source)) {
        weights.set(edge.source, (weights.get(edge.source) || 0) + edge.weight);
      }
    }
    const byId = new Map(allMemories.map(memory => [memory.id, memory]));
    return [...weights.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => byId.get(id))
      .filter(Boolean);
  }

  const embeddingModel = 'Xenova/multilingual-e5-small';
  const vectorFile = () => path.join(app.getPath('userData'), 'personal-brain-vectors.enc');
  let extractorPromise = null;

  function readVectorCache() {
    try {
      const decoded = safeStorage.decryptString(fs.readFileSync(vectorFile()));
      const parsed = JSON.parse(decoded);
      return parsed.model === embeddingModel && parsed.vectors && typeof parsed.vectors === 'object'
        ? parsed.vectors : {};
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn('Semantic vector cache will be rebuilt:', err.message);
      return {};
    }
  }
  function writeVectorCache(vectors) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is unavailable.');
    const target = vectorFile();
    const tmp = target + '.tmp';
    fs.writeFileSync(tmp, safeStorage.encryptString(JSON.stringify({ model: embeddingModel, vectors })), { mode: 0o600 });
    fs.renameSync(tmp, target);
  }
  async function embedTexts(texts) {
    if (!texts.length) return [];
    if (typeof semanticEmbedder === 'function') return semanticEmbedder(texts);
    if (!extractorPromise) {
      extractorPromise = (async () => {
        const { pipeline, env } = await import('@huggingface/transformers');
        env.cacheDir = path.join(app.getPath('userData'), 'semantic-model-cache');
        env.useFSCache = true;
        env.allowRemoteModels = true;
        return pipeline('feature-extraction', embeddingModel, { dtype: 'q8' });
      })().catch(error => {
        extractorPromise = null;
        throw error;
      });
    }
    const extractor = await extractorPromise;
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    return output.tolist();
  }
  function cosineSimilarity(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return -1;
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += Number(a[i]) * Number(b[i]);
    return Number.isFinite(dot) ? dot : -1;
  }
  async function semanticSearch(query, memories) {
    const value = String(query || '').trim();
    if (!value || !memories.length) return [];
    try {
      const cache = readVectorCache();
      const currentIds = new Set(memories.map(memory => memory.id));
      for (const id of Object.keys(cache)) if (!currentIds.has(id)) delete cache[id];
      const missing = memories.filter(memory => !Array.isArray(cache[memory.id]));
      if (missing.length) {
        // Keep inference batches small so a large imported library does not spike RAM.
        for (let offset = 0; offset < missing.length; offset += 12) {
          const batch = missing.slice(offset, offset + 12);
          const vectors = await embedTexts(batch.map(memory => 'passage: ' + memory.text));
          if (vectors.length !== batch.length) throw new Error('Embedding model returned an unexpected vector count.');
          batch.forEach((memory, index) => { cache[memory.id] = vectors[index]; });
        }
        writeVectorCache(cache);
      }
      const [queryVector] = await embedTexts(['query: ' + value]);
      if (!queryVector) throw new Error('Embedding model returned no query vector.');
      const lexical = new Map(rank(value, memories).map((memory, index) => [memory.id, index]));
      return memories.map(memory => ({
        memory,
        similarity: cosineSimilarity(queryVector, cache[memory.id]),
        lexicalRank: lexical.has(memory.id) ? lexical.get(memory.id) : 9999
      }))
        .filter(item => item.similarity >= 0.20)
        .sort((a, b) => (b.similarity + (b.lexicalRank < 9999 ? 0.04 / (1 + b.lexicalRank) : 0))
          - (a.similarity + (a.lexicalRank < 9999 ? 0.04 / (1 + a.lexicalRank) : 0)))
        .slice(0, 20)
        .map(item => item.memory);
    } catch (error) {
      console.warn('Local semantic search unavailable; using lexical fallback:', error.message);
      return rank(value, memories).slice(0, 20);
    }
  }
  async function search(query = '') {
    const memories = load().memories;
    const value = String(query).trim();
    return (value ? await semanticSearch(value, memories) : memories).slice(0, 100);
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
    // Keep paragraph boundaries as separate memory chunks; combine sentences only within a paragraph.
    const paragraphs = normalized.split(/\n{2,}/u).map(part => part.trim()).filter(Boolean);
    const chunks = [];
    for (const paragraph of paragraphs) {
      const units = paragraph.split(/(?<=[.!?।])\s+/u).map(part => part.trim()).filter(Boolean);
      let current = '';
      for (const unit of units) {
        if (unit.length > 900) {
          if (current) { chunks.push(current); current = ''; }
          for (let i = 0; i < unit.length; i += 900) chunks.push(unit.slice(i, i + 900));
          continue;
        }
        if (current && (current.length + unit.length + 1) > 900) {
          chunks.push(current);
          current = unit;
        } else {
          current = current ? current + '\n' + unit : unit;
        }
      }
      if (current) chunks.push(current);
    }
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
  async function context(query) {
    const memories = load().memories;
    const direct = (await semanticSearch(query, memories)).slice(0, 5);
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
  function graph() { return buildKnowledgeGraph(load().memories); }
  return { remember, ingest, list, search, forget, clear, context, graph };
}
module.exports = { createPersonalBrain };
