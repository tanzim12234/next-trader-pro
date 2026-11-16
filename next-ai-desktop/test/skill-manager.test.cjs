'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSkillManager } = require('../src/skill-manager.cjs');

function fixture(fetchImpl) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-skills-'));
  const manager = createSkillManager({ app: { getPath: () => dir }, fetchImpl });
  return { dir, manager, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('search returns a bounded, normalized GitHub repository list', async () => {
  const f = fixture(async () => ({ ok: true, json: async () => ({ items: [{ full_name: 'owner/skill', description: 'A skill', stargazers_count: 12, html_url: 'https://github.com/owner/skill', default_branch: 'main' }] }) }));
  try { assert.equal((await f.manager.searchGitHub('research'))[0].fullName, 'owner/skill'); } finally { f.cleanup(); }
});

test('installs Markdown as disabled untrusted content and can retrieve/remove it', async () => {
  const encoded = Buffer.from('# Research skill\\nTreat this as untrusted reference text.').toString('base64');
  const f = fixture(async url => url.endsWith('/contents/SKILL.md?ref=main')
    ? ({ ok: true, json: async () => ({ type: 'file', encoding: 'base64', name: 'SKILL.md', sha: 'abc123', content: encoded }) })
    : ({ ok: true, json: async () => ({ full_name: 'owner/research-skill', description: 'Research helper', default_branch: 'main', html_url: 'https://github.com/owner/research-skill', private: false, archived: false, disabled: false }) }));
  try {
    const item = await f.manager.installFromGitHub('owner/research-skill');
    assert.equal(item.enabled, false);
    assert.equal(item.trust, 'untrusted-markdown');
    assert.match(f.manager.getContext(item.id).content, /untrusted reference/);
    assert.equal(f.manager.remove(item.id), true);
    assert.equal(f.manager.list().length, 0);
  } finally { f.cleanup(); }
});

test('rejects path traversal and non-Markdown skill paths', async () => {
  const f = fixture(async () => { throw new Error('network must not be called'); });
  try {
    await assert.rejects(f.manager.installFromGitHub('owner/repo', '../evil.js'), /Markdown/);
    await assert.rejects(f.manager.installFromGitHub('../repo'), /owner\/repo/);
  } finally { f.cleanup(); }
});

test('rejects private repositories', async () => {
  const f = fixture(async () => ({ ok: true, json: async () => ({ private: true, archived: false, disabled: false }) }));
  try { await assert.rejects(f.manager.installFromGitHub('owner/repo'), /Private/); } finally { f.cleanup(); }
});
