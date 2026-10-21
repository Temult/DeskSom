import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {performance} from 'node:perf_hooks';
import {createFastFileSearch} from './fast-files.mjs';
import {startSelfHealingIndex} from './self-healing-client.mjs';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,timeout=10000){
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){if(predicate())return;await sleep(5)}
 throw Error('Fixture condition did not become true');
}
function fixture(t,count=1){
 const base=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'desksom-rc14-index-')));
 const state=path.join(base,'private');fs.mkdirSync(state);
 const indices=Array.from({length:count},(_,i)=>{
  const root=path.join(base,'allowed-'+i),database=path.join(state,'index-'+i+'.sqlite');
  fs.mkdirSync(root);fs.writeFileSync(path.join(root,'positive-'+i+'.txt'),'fixture');
  return {root,database};
 });
 const instances=[];
 t.after(async()=>{
  const outcomes=[];
  for(const item of instances)outcomes.push(await item.stop());
  const leases=indices.some(i=>fs.existsSync(i.database+'.writer-lock'));
  if(!leases&&outcomes.every(o=>o.status==='STOPPED'))fs.rmSync(base,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  else t.diagnostic('Preserved scoped fixture: '+base);
 });
 return {base,state,indices,track:item=>(instances.push(item),item),
  config:{stateDir:state,allowedDirectories:indices.map(i=>i.root),fastFilenameIndex:{
   enabled:true,selfHealing:true,periodicReconcileMs:300000,indices}}};
}

test('initial SQLite failure closes its own database and lease before acknowledged stop',{timeout:15000},async t=>{
 const f=fixture(t),item=f.indices[0],bytes=Buffer.alloc(4096,0x5a);
 fs.writeFileSync(item.database,bytes);
 const index=f.track(createFastFileSearch(f.config));
 await assert.rejects(()=>index.ready(),/INDEX_WORKER_NOT_READY/);
 const observed=index.snapshot();
 assert.equal(observed.ready,false);assert.equal(observed.roots[0].state,'FAILED');
 assert.equal(observed.roots[0].errorCode,'ERR_SQLITE_ERROR');
 assert.equal(JSON.stringify(observed).includes(f.state),false,'Status must not expose private database paths');
 assert.equal(fs.existsSync(item.database+'.writer-lock'),false);
 assert.deepEqual(fs.readFileSync(item.database),bytes,'Corrupt evidence is preserved, not reset');
 const result=await index.stop();
 assert.equal(result.status,'STOPPED');assert.equal(result.writerLeaseReleased,true);
});

test('one broken root does not disable a healthy root or delay acknowledged write hints',{timeout:20000},async t=>{
 const f=fixture(t,2),[good,bad]=f.indices;
 fs.writeFileSync(bad.database,Buffer.alloc(4096,0x5a));
 const index=f.track(createFastFileSearch(f.config));
 await assert.rejects(()=>index.ready(),/INDEX_WORKER_NOT_READY/);
 await until(()=>index.health(good.root));
 assert.equal(index.health(),false);
 const found=await index.search({root:good.root,query:'positive-0'});
 assert.notEqual(found.isError,true);assert.equal(found.structuredContent.selfHealing,true);
 assert.equal(found.structuredContent.results.length,1);
 const unavailable=await index.search({root:bad.root,query:'positive-1'});
 assert.equal(unavailable.isError,true);
 assert.equal(unavailable.structuredContent.status,'INDEX_WORKER_UNAVAILABLE');
 assert.equal(unavailable.structuredContent.absenceAuthoritative,false);
 const started=performance.now();
 const hint=await index.notifyCompletedWrite('write_file',{path:path.join(bad.root,'new.txt')});
 assert.equal(hint.results[0].status,'INDEX_NOT_READY');
 assert.ok(performance.now()-started<500,'A completed file write must not wait for a failed index');
 assert.equal((await index.stop()).status,'STOPPED');
 for(const i of f.indices)assert.equal(fs.existsSync(i.database+'.writer-lock'),false);
});

test('initial scan progress is observable and cooperative stop rolls back an incomplete cold build',{timeout:30000},async t=>{
 const f=fixture(t),item=f.indices[0];
 for(let d=0;d<30;d++){
  const dir=path.join(item.root,'directory-'+d);fs.mkdirSync(dir);
  for(let n=0;n<200;n++)fs.writeFileSync(path.join(dir,'file-'+n+'.txt'),'');
 }
 const worker=f.track(startSelfHealingIndex({...item,privateState:f.state,periodicReconcileMs:300000,fixtureOnly:true}));
 await until(()=>worker.snapshot().progress?.phase==='COLD_BUILD');
 assert.equal(worker.latest,'INITIALIZING','Progress is not a readiness claim');
 const beginning=performance.now(),stopped=await worker.stop();
 assert.equal(stopped.status,'STOPPED');assert.equal(stopped.gracefulExit,true);
 assert.ok(performance.now()-beginning<6000,'Cooperative scan stop exceeded its bounded protocol');
 assert.equal(fs.existsSync(item.database+'.writer-lock'),false);
 const db=new DatabaseSync(item.database,{readOnly:true});
 try{assert.equal(db.prepare('SELECT COUNT(*) n FROM entries').get().n,0,'Cancelled cold build must roll back its transaction')}
 finally{db.close()}
});

test('an incompatible database is retained and initialization cleanup remains stop-verifiable',{timeout:15000},async t=>{
 const f=fixture(t),item=f.indices[0];
 const db=new DatabaseSync(item.database);
 db.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,val TEXT NOT NULL); INSERT INTO meta VALUES('schema','foreign-schema')");db.close();
 const index=f.track(createFastFileSearch(f.config));
 await assert.rejects(()=>index.ready(),/INDEX_WORKER_NOT_READY/);
 assert.equal(index.snapshot().roots[0].errorCode,'DB_SCHEMA_MISMATCH');
 assert.equal((await index.stop()).status,'STOPPED');
 assert.equal(fs.existsSync(item.database+'.writer-lock'),false);
 const preserved=new DatabaseSync(item.database,{readOnly:true});
 try{assert.equal(preserved.prepare("SELECT val FROM meta WHERE key='schema'").get().val,'foreign-schema')}
 finally{preserved.close()}
});

test('duplicate-writer failure cannot remove or acknowledge release of another worker lease',{timeout:20000},async t=>{
 const f=fixture(t),item=f.indices[0];
 const owner=f.track(createFastFileSearch(f.config));await owner.ready();
 const marker=path.join(item.database+'.writer-lock','owner.json'),original=fs.readFileSync(marker,'utf8');
 const other=f.track(createFastFileSearch(f.config));
 await assert.rejects(()=>other.ready(),/INDEX_WORKER_NOT_READY/);
 assert.equal(other.snapshot().roots[0].errorCode,'INDEX_WRITER_LOCKED');
 assert.equal(fs.readFileSync(marker,'utf8'),original);
 const stopped=await other.stop();assert.equal(stopped.status,'UNCONFIRMED');
 assert.equal(stopped.writerLeaseReleased,false);
 assert.equal(fs.readFileSync(marker,'utf8'),original);
 assert.equal((await owner.search({root:item.root,query:'positive'})).structuredContent.results.length,1);
 assert.equal((await owner.stop()).status,'STOPPED');
});
