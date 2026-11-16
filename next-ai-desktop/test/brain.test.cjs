const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPersonalBrain } = require('../src/brain.cjs');

function setup() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'next-ai-brain-'));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(value, 'utf8'),
    decryptString: value => Buffer.from(value).toString('utf8')
  };
  const brain = createPersonalBrain({ app: { getPath: () => userData }, safeStorage });
  return { brain, userData, cleanup: () => fs.rmSync(userData, { recursive: true, force: true }) };
}

test('persists Bengali memory across instances and finds it', t => {
  const x = setup(); t.after(x.cleanup);
  x.brain.remember('আমার পছন্দের ভাষা বাংলা', 'preference');
  const again = createPersonalBrain({ app: { getPath: () => x.userData }, safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(value),
    decryptString: value => Buffer.from(value).toString('utf8')
  }});
  assert.equal(again.list('বাংলা')[0].text, 'আমার পছন্দের ভাষা বাংলা');
});

test('ranks relevant memories and excludes unrelated context', t => {
  const x = setup(); t.after(x.cleanup);
  x.brain.remember('NEXT AI personal brain stores encrypted memories', 'project');
  x.brain.remember('NEXT AI personal brain learns from saved knowledge', 'project');
  x.brain.remember('Chocolate cake recipe with cocoa', 'food');
  assert.equal(x.brain.list('personal brain').length, 2);
  const context = x.brain.context('encrypted memories');
  assert.match(context, /encrypted memories/);
  assert.doesNotMatch(context, /Chocolate cake/);
});

test('updates duplicates, forgets one memory, and clears all', t => {
  const x = setup(); t.after(x.cleanup);
  const a = x.brain.remember('Remember this fact');
  const b = x.brain.remember('remember this fact', 'important');
  assert.equal(a.id, b.id);
  assert.equal(x.brain.list().length, 1);
  assert.equal(x.brain.forget(a.id).deleted, 1);
  x.brain.remember('Another fact');
  assert.deepEqual(x.brain.clear(), { cleared: true });
  assert.equal(x.brain.list().length, 0);
});

test('rejects invalid input and unavailable secure storage', t => {
  const x = setup(); t.after(x.cleanup);
  assert.throws(() => x.brain.remember('  '), /1–1000/);
  assert.throws(() => x.brain.remember('x'.repeat(1001)), /1–1000/);
  const unavailable = createPersonalBrain({ app: { getPath: () => x.userData }, safeStorage: {
    isEncryptionAvailable: () => false
  }});
  assert.throws(() => unavailable.list(), /Secure storage is unavailable/);
});

test('does not silently treat corrupted data as an empty brain', t => {
  const x = setup(); t.after(x.cleanup);
  fs.writeFileSync(path.join(x.userData, 'personal-brain.enc'), 'not-json');
  assert.throws(() => x.brain.list(), SyntaxError);
});


test('ingests a lesson into searchable encrypted chunks', t => {
  const x = setup(); t.after(x.cleanup);
  const result = x.brain.ingest('Alpha knowledge is useful.\r\n\r\nBeta knowledge is searchable.', 'study');
  assert.equal(result.saved, 2);
  assert.equal(x.brain.list('alpha').length, 1);
  assert.equal(x.brain.list('beta').length, 1);
  assert.equal(x.brain.list()[0].category, 'study');
});

test('splits long lessons into bounded chunks and rejects oversized input', t => {
  const x = setup(); t.after(x.cleanup);
  const result = x.brain.ingest('A'.repeat(50000), 'study');
  assert.ok(result.saved > 1);
  assert.ok(result.memories.every(item => item.text.length <= 1000));
  assert.throws(() => x.brain.ingest('x'.repeat(50001)), /50,000/);
});

test('retrieves related Bengali and English wording across inflections', t => {
  const x = setup(); t.after(x.cleanup);
  x.brain.remember('আমি বাংলায় উত্তর পছন্দ করি', 'preference');
  x.brain.remember('NEXT AI personal brain stores encrypted memories', 'project');
  assert.equal(x.brain.list('বাংলায় কথা বলো')[0].text, 'আমি বাংলায় উত্তর পছন্দ করি');
  assert.equal(x.brain.list('my language preference')[0].text, 'আমি বাংলায় উত্তর পছন্দ করি');
  assert.equal(x.brain.list('personal brain memory')[0].text, 'NEXT AI personal brain stores encrypted memories');
});

test('meaning-aware search does not return unrelated memories', t => {
  const x = setup(); t.after(x.cleanup);
  x.brain.remember('আমি বাংলায় উত্তর পছন্দ করি', 'preference');
  x.brain.remember('Chocolate cake recipe with cocoa', 'food');
  assert.deepEqual(x.brain.list('vehicle engine repair'), []);
});

test('builds a local knowledge graph from related memories', t => {
  const x = setup(); t.after(x.cleanup);
  const a = x.brain.remember('NEXT AI personal brain stores encrypted memories', 'project');
  const b = x.brain.remember('NEXT AI personal brain searches saved memories', 'project');
  x.brain.remember('Chocolate cake recipe with cocoa', 'food');
  const graph = x.brain.graph();
  assert.equal(graph.nodes.length, 3);
  assert.ok(graph.edges.some(edge => (edge.source === a.id && edge.target === b.id) || (edge.source === b.id && edge.target === a.id)));
  assert.ok(graph.edges.every(edge => edge.weight > 0 && edge.topics.length > 0));
});
