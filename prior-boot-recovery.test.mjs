import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {recoverPriorBootIndexLease} from './prior-boot-recovery.mjs';
import {acquireIndexWriterLock,indexWriterLeaseAbsent} from './index-writer-lock.mjs';

const hash=buf=>createHash('sha256').update(buf).digest('hex');
const day=86400000;
function fixture(){
 const base=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'desksom-prior-boot-')));
 const privateState=path.join(base,'private'),indices=path.join(privateState,'indices');
 fs.mkdirSync(indices,{recursive:true});
 const database=path.join(indices,'bound.sqlite'),body=Buffer.from('THE_DATABASE_IS_NEVER_MODIFIED');
 fs.writeFileSync(database,body);
 const lock=database+'.writer-lock';
 fs.mkdirSync(lock);
 const record={schema:'desksom.index-writer/v1',pid:99123,threadId:1,token:randomUUID(),
   startedUtc:new Date(Date.now()-day).toISOString()};
 fs.writeFileSync(path.join(lock,'owner.json'),JSON.stringify(record)+'\n');
 const now=Date.now(),clock={nowMs:now+2*day,bootTimeMs:now+day};
 return {base,privateState,indices,database,lock,record,clock,body,
  clean(){fs.rmSync(base,{recursive:true,force:true,maxRetries:5,retryDelay:50})}};
}
test('provably previous-boot writer marker is preserved intact and database bytes unchanged',()=>{
 const f=fixture();try{
  const marker=fs.readFileSync(path.join(f.lock,'owner.json')),dbHash=hash(f.body);
  const result=recoverPriorBootIndexLease(f.database,f.privateState,f.clock);
  assert.equal(result.status,'RECOVERED',JSON.stringify(result));
  assert.equal(indexWriterLeaseAbsent(f.database),true);
  assert.equal(hash(fs.readFileSync(f.database)),dbHash);
  const parent=path.join(f.privateState,'owner-repairs'),folders=fs.readdirSync(parent);
  assert.equal(folders.length,1);
  const q=path.join(parent,folders[0]),preserved=path.join(q,path.basename(f.lock),'owner.json');
  assert.deepEqual(fs.readFileSync(preserved),marker);
  assert.equal(JSON.parse(fs.readFileSync(path.join(q,'RECOVERY_RESULT.json'))).status,'PRIOR_BOOT_LOCK_QUARANTINED');
  const writer=acquireIndexWriterLock(f.database,{privateState:f.privateState});
  assert.equal(indexWriterLeaseAbsent(f.database),false);
  writer.release();assert.equal(indexWriterLeaseAbsent(f.database),true);
 }finally{f.clean()}
});
test('same-boot writer is never moved or acquired by another writer',()=>{
 const f=fixture();try{
  const marker=fs.readFileSync(path.join(f.lock,'owner.json'));
  const result=recoverPriorBootIndexLease(f.database,f.privateState,{nowMs:Date.now(),bootTimeMs:Date.now()-day*2});
  assert.equal(result.status,'REFUSED');assert.equal(result.code,'LEASE_NOT_PROVEN_PRIOR_BOOT');
  assert.deepEqual(fs.readFileSync(path.join(f.lock,'owner.json')),marker);
  assert.throws(()=>acquireIndexWriterLock(f.database,{privateState:f.privateState}),/INDEX_WRITER_LOCKED/);
 }finally{f.clean()}
});
test('unknown lock contents, foreign schema and corrupt marker remain untouched',()=>{
 for(const variant of ['extra','schema','broken','missingDatabase']){
  const f=fixture();try{
   const m=path.join(f.lock,'owner.json');
   if(variant==='extra')fs.writeFileSync(path.join(f.lock,'unexpected.txt'),'guard');
   if(variant==='schema')fs.writeFileSync(m,JSON.stringify({...f.record,schema:'foreign'})+'\n');
   if(variant==='broken')fs.writeFileSync(m,'not json');
   if(variant==='missingDatabase')fs.unlinkSync(f.database);
   const result=recoverPriorBootIndexLease(f.database,f.privateState,f.clock);
   assert.equal(result.status,'REFUSED',variant+': '+JSON.stringify(result));
   assert.equal(fs.existsSync(f.lock),true);
  }finally{f.clean()}
 }
});
test('unknown private-state path and missing lease refuse without mutation',()=>{
 const f=fixture();try{
  assert.equal(recoverPriorBootIndexLease(f.database,f.base,f.clock).status,'REFUSED');
  assert.equal(fs.existsSync(f.lock),true);
  fs.rmSync(f.lock,{recursive:true});
  assert.equal(recoverPriorBootIndexLease(f.database,f.privateState,f.clock).status,'REFUSED');
 }finally{f.clean()}
});
test('unbounded timestamps and a near-boot marker are not evidence',()=>{
 for(const clock of [{bootTimeMs:NaN,nowMs:Date.now()+day},
  {bootTimeMs:Date.now(),nowMs:Date.now()+1000},
  {bootTimeMs:Date.now()-200000,nowMs:Date.now()+day}]){
  const f=fixture();try{
   assert.equal(recoverPriorBootIndexLease(f.database,f.privateState,clock).status,'REFUSED');
   assert.equal(fs.existsSync(f.lock),true);
  }finally{f.clean()}
 }
});

test('prior boot recovery works immediately after sign-in instead of waiting five minutes',()=>{
 const f=fixture();try{
  const boot=Date.now()+day;
  const result=recoverPriorBootIndexLease(f.database,f.privateState,
    {bootTimeMs:boot,nowMs:boot+8000});
  assert.equal(result.status,'RECOVERED',JSON.stringify(result));
  assert.equal(fs.existsSync(f.lock),false);
 }finally{f.clean()}
});

test('real Windows worker reclaims only an old-boot fixture lease and indexes normally',
 {timeout:30000,skip:process.platform!=='win32'||Number(process.versions.node.split('.')[0])<25},async()=>{
 const {execFileSync}=await import('node:child_process');
 const {DatabaseSync}=await import('node:sqlite');
 const {createFastFileSearch}=await import('./fast-files.mjs');
 const f=fixture(),root=path.join(f.base,'allowed');
 let index=null,success=false;
 try{
  fs.mkdirSync(root);fs.writeFileSync(path.join(root,'after-reboot.txt'),'disposable fixture');
  // This integration fixture needs a real SQLite preimage, not the byte-retention
  // sentinel used by the pure ownership tests above.
  fs.unlinkSync(f.database);
  const db=new DatabaseSync(f.database);db.exec('PRAGMA user_version=0');db.close();
  const oldTime=new Date(Date.now()-os.uptime()*1000-day);
  f.record.startedUtc=oldTime.toISOString();
  fs.writeFileSync(path.join(f.lock,'owner.json'),JSON.stringify(f.record));
  const quote=x=>x.replaceAll("'","''");
  const stamp=oldTime.toISOString();
  const ps=`$date=[DateTime]::Parse('${stamp}').ToUniversalTime();`+
    `[IO.Directory]::SetCreationTimeUtc('${quote(f.lock)}',$date);`+
    `[IO.File]::SetCreationTimeUtc('${quote(path.join(f.lock,'owner.json'))}',$date);`+
    `[IO.File]::SetLastWriteTimeUtc('${quote(path.join(f.lock,'owner.json'))}',$date)`;
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],
    {windowsHide:true,timeout:10000,stdio:'pipe'});
  index=createFastFileSearch({stateDir:f.privateState,allowedDirectories:[root],
   fastFilenameIndex:{enabled:true,selfHealing:true,periodicReconcileMs:300000,
    indices:[{root,database:f.database}]}});
  assert.equal((await index.ready()).status,'READY');
  const entry=index.snapshot().roots[0];
  assert.equal(entry.priorBootLockRecovered,true,JSON.stringify(entry));
  assert.equal((await index.search({root,query:'after-reboot'})).structuredContent.results.length,1);
  const evidence=fs.readdirSync(path.join(f.privateState,'owner-repairs'));
  assert.equal(evidence.length,1);
  assert.equal(JSON.parse(fs.readFileSync(
    path.join(f.privateState,'owner-repairs',evidence[0],'RECOVERY_RESULT.json'))).status,
    'PRIOR_BOOT_LOCK_QUARANTINED');
  success=true;
 }catch(error){console.warn('Index snapshot on fixture failure:',JSON.stringify(index?.snapshot()));throw error}
 finally{
  const stop=index?await index.stop():{status:'STOPPED'};
  if(success)assert.equal(stop.status,'STOPPED',JSON.stringify(stop));
  if(stop.status==='STOPPED')try{f.clean()}catch(error){console.warn('Fixture cleanup retained evidence:',error?.code)}
  else console.warn('Preserved unconfirmed fixture at:',f.base,JSON.stringify(stop));
 }
});

test('a live PID is never displaced even when lease timestamps appear to predate boot',
 {timeout:10000},async()=>{
 const {spawn}=await import('node:child_process');
 const f=fixture(),child=spawn(process.execPath,['-e','setInterval(()=>{},10000)'],
  {windowsHide:true,stdio:'ignore'});
 try{
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});
  f.record.pid=child.pid;
  fs.writeFileSync(path.join(f.lock,'owner.json'),JSON.stringify(f.record));
  const result=recoverPriorBootIndexLease(f.database,f.privateState,f.clock);
  assert.equal(result.status,'REFUSED');
  assert.equal(result.code,'RECORDED_OWNER_PID_MAY_BE_ALIVE');
  assert.equal(fs.existsSync(f.lock),true);
 }finally{
  if(child.pid&&child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));
    child.kill();await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,1500))])}
  f.clean();
 }
});
