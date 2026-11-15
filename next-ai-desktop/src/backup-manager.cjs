'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

function createBackupManager(userDataPath){
 const backupRoot=path.join(userDataPath,'backups');
 const sources=['personal-brain.enc','settings.enc','task-history.enc'];
 function list(){
  try{return fs.readdirSync(backupRoot,{withFileTypes:true}).filter(d=>d.isDirectory()&&/^backup-[a-f0-9-]{20,60}$/.test(d.name)).map(d=>{
   const manifest=JSON.parse(fs.readFileSync(path.join(backupRoot,d.name,'manifest.json'),'utf8'));
   return {id:d.name,createdAt:String(manifest.createdAt||''),files:Array.isArray(manifest.files)?manifest.files.length:0};
  }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}catch{return [];}
 }
 function create(){
  fs.mkdirSync(backupRoot,{recursive:true});
  const id='backup-'+Date.now().toString(16)+'-'+crypto.randomBytes(6).toString('hex');
  const dir=path.join(backupRoot,id);fs.mkdirSync(dir,{mode:0o700});
  const files=[];
  for(const name of sources){const src=path.join(userDataPath,name);if(fs.existsSync(src)){fs.copyFileSync(src,path.join(dir,name),fs.constants.COPYFILE_EXCL);files.push(name);}}
  if(!files.length){fs.rmSync(dir,{recursive:true,force:true});throw new Error('No encrypted data files are available to back up.');}
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),files}),{mode:0o600,flag:'wx'});
  for(const old of list().slice(5))fs.rmSync(path.join(backupRoot,old.id),{recursive:true,force:true});
  return {id,files:files.length,createdAt:new Date().toISOString()};
 }
 function restore(id){
  if(typeof id!=='string'||!/^backup-[a-f0-9-]{20,60}$/.test(id))throw new Error('Invalid backup ID.');
  const dir=path.resolve(backupRoot,id);
  if(!dir.startsWith(path.resolve(backupRoot)+path.sep))throw new Error('Invalid backup path.');
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  if(!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.some(name=>!sources.includes(name)))throw new Error('Backup manifest is invalid.');
  for(const name of manifest.files){
   const src=path.join(dir,name);const stat=fs.lstatSync(src);
   if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Backup file is invalid.');
   const target=path.join(userDataPath,name),tmp=target+'.restore.tmp';
   fs.copyFileSync(src,tmp);fs.renameSync(tmp,target);
  }
  return {restored:manifest.files.length,createdAt:manifest.createdAt};
 }
 return {list,create,restore};
}
module.exports={createBackupManager};
