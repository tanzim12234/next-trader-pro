'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_FILE_BYTES = 100 * 1024;
const MAX_TOTAL_BYTES = 300 * 1024;

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeTarget(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.length > 240) {
    throw new Error('Invalid patch path.');
  }
  if (relativePath.includes('\') || path.posix.isAbsolute(relativePath) || /^[a-zA-Z]:/.test(relativePath)) {
    throw new Error('Absolute paths and Windows separators are not allowed.');
  }
  const parts = relativePath.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw new Error('Path traversal is not allowed.');
  const allowed = relativePath === 'package.json'
    || /^src\/[a-zA-Z0-9._-]+\.(?:cjs|js|html|css)$/.test(relativePath)
    || /^test\/[a-zA-Z0-9._-]+\.test\.cjs$/.test(relativePath);
  if (!allowed) throw new Error('Only approved src/, test/, and package.json files can be patched.');
  const base = path.resolve(root);
  const target = path.resolve(base, ...parts);
  if (!target.startsWith(base + path.sep)) throw new Error('Patch path escapes the selected project.');
  return target;
}

function atomicWrite(target, content) {
  const temp = target + '.next-tmp-' + crypto.randomUUID();
  fs.writeFileSync(temp, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  try { fs.renameSync(temp, target); } catch (error) {
    try { fs.unlinkSync(temp); } catch {}
    throw error;
  }
}

function createPatchProposal({ root, workspace, changes }) {
  if (!Array.isArray(changes) || changes.length < 1 || changes.length > 10) {
    throw new Error('A proposal must contain 1–10 file changes.');
  }
  const projectRoot = fs.realpathSync(root);
  const proposalRoot = path.resolve(workspace);
  fs.mkdirSync(proposalRoot, { recursive: true });
  let total = 0;
  const seen = new Set();
  const files = changes.map(change => {
    const relativePath = change?.path;
    if (seen.has(relativePath)) throw new Error('Duplicate patch path.');
    seen.add(relativePath);
    const target = safeTarget(projectRoot, relativePath);
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Only existing regular files can be changed.');
    const before = fs.readFileSync(target, 'utf8');
    const after = change?.content;
    if (typeof after !== 'string' || Buffer.byteLength(after, 'utf8') > MAX_FILE_BYTES) {
      throw new Error('Each proposed file must be text under 100 KB.');
    }
    total += Buffer.byteLength(after, 'utf8');
    if (total > MAX_TOTAL_BYTES) throw new Error('Total patch size exceeds 300 KB.');
    return {
      path: relativePath,
      beforeHash: hash(before),
      afterHash: hash(after),
      before,
      after
    };
  });
  const id = crypto.randomUUID();
  const record = {
    id,
    root: projectRoot,
    status: 'review-required',
    createdAt: new Date().toISOString(),
    files
  };
  const directory = path.join(proposalRoot, id);
  fs.mkdirSync(directory, { mode: 0o700 });
  fs.writeFileSync(path.join(directory, 'proposal.json'), JSON.stringify(record, null, 2), { flag: 'wx', mode: 0o600 });
  return summarize(record);
}

function readProposal(workspace, id) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid proposal ID.');
  const base = path.resolve(workspace);
  const file = path.resolve(base, id, 'proposal.json');
  if (!file.startsWith(base + path.sep)) throw new Error('Invalid proposal location.');
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (record.id !== id || !Array.isArray(record.files)) throw new Error('Proposal record is invalid.');
  return { base, file, record };
}

function summarize(record) {
  return {
    id: record.id,
    status: record.status,
    files: record.files.map(file => ({
      path: file.path,
      beforeHash: file.beforeHash,
      afterHash: file.afterHash,
      changed: file.before !== file.after,
      before: file.before,
      after: file.after
    }))
  };
}

function applyPatchProposal({ root, workspace, id, approved }) {
  if (approved !== true) throw new Error('Explicit approval is required before applying a patch.');
  const projectRoot = fs.realpathSync(root);
  const { file: recordFile, record } = readProposal(workspace, id);
  if (record.root !== projectRoot) throw new Error('This proposal belongs to a different selected project folder.');
  if (record.status !== 'review-required') throw new Error('Only a reviewed, unapplied proposal can be applied.');
  const targets = record.files.map(item => {
    const target = safeTarget(projectRoot, item.path);
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Patch target is no longer a regular file.');
    const current = fs.readFileSync(target, 'utf8');
    if (hash(current) !== item.beforeHash) throw new Error('Source changed since proposal creation: ' + item.path);
    return { item, target, current };
  });
  const written = [];
  try {
    for (const entry of targets) {
      atomicWrite(entry.target, entry.item.after);
      written.push(entry);
    }
  } catch (error) {
    for (const entry of written.reverse()) atomicWrite(entry.target, entry.current);
    throw error;
  }
  record.status = 'applied';
  record.appliedAt = new Date().toISOString();
  fs.writeFileSync(recordFile, JSON.stringify(record, null, 2), { mode: 0o600 });
  return { id, status: record.status, files: record.files.map(item => item.path), testsRun: false };
}

function rollbackPatchProposal({ root, workspace, id }) {
  const projectRoot = fs.realpathSync(root);
  const { file: recordFile, record } = readProposal(workspace, id);
  if (record.root !== projectRoot) throw new Error('This proposal belongs to a different selected project folder.');
  if (record.status !== 'applied') throw new Error('Only an applied proposal can be rolled back.');
  const targets = record.files.map(item => {
    const target = safeTarget(projectRoot, item.path);
    const current = fs.readFileSync(target, 'utf8');
    if (hash(current) !== item.afterHash) throw new Error('File changed after patch application; refusing unsafe rollback: ' + item.path);
    return { item, target, current };
  });
  const restored = [];
  try {
    for (const entry of targets) {
      atomicWrite(entry.target, entry.item.before);
      restored.push(entry);
    }
  } catch (error) {
    for (const entry of restored.reverse()) atomicWrite(entry.target, entry.current);
    throw error;
  }
  record.status = 'rolled-back';
  record.rolledBackAt = new Date().toISOString();
  fs.writeFileSync(recordFile, JSON.stringify(record, null, 2), { mode: 0o600 });
  return { id, status: record.status, files: record.files.map(item => item.path) };
}

module.exports = { createPatchProposal, summarize, applyPatchProposal, rollbackPatchProposal, safeTarget };
