'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createBackupManager}=require('../src/backup-manager.cjs');

test('backs up encrypted files and restores a previous snapshot',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'next-backup-'));
 fs.writeFileSync(path.join(dir,'settings.enc'),'encrypted settings');
 fs.writeFileSync(path.join(dir,'personal-brain.enc'),'encrypted brain');
 const manager=createBackupManager(dir);
 const backup=manager.create();
 assert.equal(backup.files,2);
 fs.writeFileSync(path.join(dir,'settings.enc'),'new settings');
 const result=manager.restore(backup.id);
 assert.equal(result.restored,2);
 assert.equal(fs.readFileSync(path.join(dir,'settings.enc'),'utf8'),'encrypted settings');
 assert.equal(manager.list().length,1);
 fs.rmSync(dir,{recursive:true,force:true});
});
test('rejects unsafe backup identifiers and missing snapshots',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'next-backup-'));
 const manager=createBackupManager(dir);
 assert.throws(()=>manager.restore('../settings.enc'));
 assert.throws(()=>manager.create(),/No encrypted data/);
 fs.rmSync(dir,{recursive:true,force:true});
});
