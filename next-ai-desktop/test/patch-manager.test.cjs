'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createPatchProposal,
  applyPatchProposal,
  rollbackPatchProposal
} = require('../src/patch-manager.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'next-project-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'next-patches-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'test'));
  fs.writeFileSync(path.join(root, 'src', 'app.cjs'), "'use strict';\\nmodule.exports = 1;\\n");
  return { root, workspace };
}

test('creates review-only patch and requires explicit approval to apply', () => {
  const { root, workspace } = fixture();
  const proposal = createPatchProposal({
    root, workspace,
    changes: [{ path: 'src/app.cjs', content: "'use strict';\\nmodule.exports = 2;\\n" }]
  });
  assert.equal(proposal.status, 'review-required');
  assert.throws(() => applyPatchProposal({ root, workspace, id: proposal.id, approved: false }), /approval/);
  assert.match(fs.readFileSync(path.join(root, 'src/app.cjs'), 'utf8'), /= 1/);
  const applied = applyPatchProposal({ root, workspace, id: proposal.id, approved: true });
  assert.equal(applied.testsRun, false);
  assert.match(fs.readFileSync(path.join(root, 'src/app.cjs'), 'utf8'), /= 2/);
});

test('rolls back only when applied files have not changed again', () => {
  const { root, workspace } = fixture();
  const proposal = createPatchProposal({
    root, workspace,
    changes: [{ path: 'src/app.cjs', content: 'module.exports = 2;\\n' }]
  });
  applyPatchProposal({ root, workspace, id: proposal.id, approved: true });
  rollbackPatchProposal({ root, workspace, id: proposal.id });
  assert.match(fs.readFileSync(path.join(root, 'src/app.cjs'), 'utf8'), /module.exports = 1/);
});

test('rejects traversal, unsupported files, symlinks, and stale source', () => {
  const { root, workspace } = fixture();
  assert.throws(() => createPatchProposal({ root, workspace, changes: [{ path: '../secret.txt', content: 'x' }] }), /traversal|approved/);
  assert.throws(() => createPatchProposal({ root, workspace, changes: [{ path: 'src/app.exe', content: 'x' }] }), /approved/);
  const proposal = createPatchProposal({ root, workspace, changes: [{ path: 'src/app.cjs', content: 'module.exports = 3;' }] });
  fs.writeFileSync(path.join(root, 'src', 'app.cjs'), 'changed outside proposal');
  assert.throws(() => applyPatchProposal({ root, workspace, id: proposal.id, approved: true }), /Source changed/);
});

test('refuses rollback after a later manual edit', () => {
  const { root, workspace } = fixture();
  const proposal = createPatchProposal({ root, workspace, changes: [{ path: 'src/app.cjs', content: 'module.exports = 4;' }] });
  applyPatchProposal({ root, workspace, id: proposal.id, approved: true });
  fs.writeFileSync(path.join(root, 'src', 'app.cjs'), 'later edit');
  assert.throws(() => rollbackPatchProposal({ root, workspace, id: proposal.id }), /changed after patch/);
});
