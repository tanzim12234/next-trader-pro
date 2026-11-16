'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_SKILL_BYTES = 32 * 1024;
const OWNER_REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,100}$/i;

function createSkillManager({ app, fetchImpl = globalThis.fetch }) {
  const root = () => path.join(app.getPath('userData'), 'skills');
  function readInstalled() {
    fs.mkdirSync(root(), { recursive: true });
    return fs.readdirSync(root(), { withFileTypes: true })
      .filter(entry => entry.isDirectory() && SAFE_ID.test(entry.name))
      .flatMap(entry => {
        try {
          const file = path.join(root(), entry.name, 'skill.json');
          const item = JSON.parse(fs.readFileSync(file, 'utf8'));
          if (item && item.id === entry.name && typeof item.name === 'string') return [item];
        } catch {}
        return [];
      });
  }
  async function searchGitHub(query, limit = 10) {
    if (typeof query !== 'string' || !query.trim() || query.length > 100) throw new Error('A short GitHub search query is required.');
    const response = await fetchImpl('https://api.github.com/search/repositories?q=' + encodeURIComponent(query.trim() + ' in:name,description') + '&sort=stars&order=desc&per_page=' + Math.max(1, Math.min(10, Number(limit) || 10)), {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'NEXT-AI-Desktop' }, signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error('GitHub skill search failed (' + response.status + ').');
    const data = await response.json();
    return (Array.isArray(data.items) ? data.items : []).slice(0, 10).map(repo => ({
      fullName: repo.full_name, description: String(repo.description || '').slice(0, 240),
      stars: Number(repo.stargazers_count) || 0, url: repo.html_url, defaultBranch: repo.default_branch
    })).filter(item => typeof item.fullName === 'string' && OWNER_REPO.test(item.fullName));
  }
  async function installFromGitHub(fullName, skillPath = 'SKILL.md') {
    if (typeof fullName !== 'string' || !OWNER_REPO.test(fullName)) throw new Error('Use a GitHub repository in owner/repo format.');
    if (typeof skillPath !== 'string' || skillPath.length > 180 || skillPath.startsWith('/') || skillPath.split('/').some(part => !part || part === '.' || part === '..') || !/\.md$/i.test(skillPath)) {
      throw new Error('Only a Markdown skill file with a safe repository path can be installed.');
    }
    const api = 'https://api.github.com/repos/' + fullName;
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'NEXT-AI-Desktop' };
    const repoResponse = await fetchImpl(api, { headers, signal: AbortSignal.timeout(15000) });
    if (!repoResponse.ok) throw new Error('Could not verify the GitHub repository (' + repoResponse.status + ').');
    const repoInfo = await repoResponse.json();
    if (repoInfo.private || repoInfo.archived || repoInfo.disabled) throw new Error('Private, archived or disabled repositories are not supported.');
    const branch = String(repoInfo.default_branch || 'main');
    const fileUrl = api + '/contents/' + skillPath.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(branch);
    const fileResponse = await fetchImpl(fileUrl, { headers, signal: AbortSignal.timeout(15000) });
    if (!fileResponse.ok) throw new Error('Skill Markdown file was not found (' + fileResponse.status + ').');
    const file = await fileResponse.json();
    if (file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string' || !/\.md$/i.test(file.name || '')) {
      throw new Error('GitHub did not return a Markdown file.');
    }
    const content = Buffer.from(file.content.replace(/\s/g, ''), 'base64').toString('utf8');
    if (!content.trim() || Buffer.byteLength(content, 'utf8') > MAX_SKILL_BYTES) throw new Error('Skill must contain 1–32 KB of Markdown.');
    const slug = fullName.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 80);
    const id = slug + '-' + crypto.createHash('sha256').update(fullName.toLowerCase()).digest('hex').slice(0, 12);
    const targetDir = path.join(root(), id);
    fs.mkdirSync(targetDir, { recursive: true });
    const metadata = { id, name: String(repoInfo.full_name || fullName), description: String(repoInfo.description || '').slice(0, 240), source: 'github', sourceUrl: repoInfo.html_url, filePath: skillPath, fileSha: String(file.sha || ''), installedAt: new Date().toISOString(), trust: 'untrusted-markdown', enabled: false };
    const contentPath = path.join(targetDir, 'SKILL.md');
    const tempPath = contentPath + '.tmp';
    fs.writeFileSync(tempPath, content, { encoding: 'utf8', flag: 'w', mode: 0o600 });
    fs.renameSync(tempPath, contentPath);
    fs.writeFileSync(path.join(targetDir, 'skill.json'), JSON.stringify(metadata, null, 2), { encoding: 'utf8', mode: 0o600 });
    return metadata;
  }
  function list() { return readInstalled(); }
  function getContext(id) {
    if (typeof id !== 'string' || !SAFE_ID.test(id)) throw new Error('Invalid skill id.');
    const metadata = readInstalled().find(item => item.id === id);
    if (!metadata) throw new Error('Skill is not installed.');
    const content = fs.readFileSync(path.join(root(), id, 'SKILL.md'), 'utf8');
    return { metadata, content };
  }
  function remove(id) {
    if (typeof id !== 'string' || !SAFE_ID.test(id)) throw new Error('Invalid skill id.');
    const metadata = readInstalled().find(item => item.id === id);
    if (!metadata) return false;
    fs.rmSync(path.join(root(), id), { recursive: true, force: false });
    return true;
  }
  return Object.freeze({ searchGitHub, installFromGitHub, list, getContext, remove });
}

module.exports = { createSkillManager, MAX_SKILL_BYTES };
