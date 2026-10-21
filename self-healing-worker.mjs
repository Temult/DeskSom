// Development-only DeskSom self-healing filename index worker.
// Runs in a worker thread. Never executes arbitrary file content.
import fs from 'node:fs';
import path from 'node:path';
import {parentPort,workerData} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {performance} from 'node:perf_hooks';
import {acquireIndexWriterLock,indexWriterLeaseAbsent} from './index-writer-lock.mjs';

const resources={database:null,lease:null,watcher:null,clearTimers:null};
function startWorker(){
const stopFlag=workerData.stopSignal instanceof SharedArrayBuffer?new Int32Array(workerData.stopSignal):null;
function checkStop(){
 if(stopFlag&&Atomics.load(stopFlag,0)!==0)
  throw Object.assign(new Error('INDEX_STOP_REQUESTED'),{code:'INDEX_STOP_REQUESTED'});
}
const norm=p=>path.win32.resolve(p).replace(/\\+$/,'').toLowerCase();
const inside=(r,p)=>norm(r)===norm(p)||norm(p).startsWith(norm(r)+'\\');
const root=fs.realpathSync.native(workerData.root);
const dbFile=path.win32.resolve(workerData.database);
if(!inside(workerData.approvedRoot,root)||norm(workerData.approvedRoot)!==norm(root))throw Error('ROOT_POLICY_MISMATCH');
if(inside(root,dbFile))throw Error('DB_INSIDE_INDEXED_ROOT');
const period=Number(workerData.periodicReconcileMs??1800000);
const fixtureFast=workerData.fixtureOnly===true && norm(root).includes('\\ops\\self-healing-');
if(!Number.isSafeInteger(period)||period<(fixtureFast?100:300000)||period>86400000)throw Error('PERIODIC_INTERVAL_OUT_OF_RANGE');
const privateState=fs.realpathSync.native(workerData.privateState);
if(!inside(privateState,fs.realpathSync.native(path.dirname(dbFile))))throw Error('DB_OUTSIDE_PRIVATE_STATE');
const writerLease=resources.lease=acquireIndexWriterLock(dbFile,{privateState});
const existed=fs.existsSync(dbFile);
const db=resources.database=new DatabaseSync(dbFile,{timeout:5000});
db.exec('PRAGMA journal_mode=WAL;PRAGMA synchronous=NORMAL;PRAGMA busy_timeout=5000;');
db.exec('CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,val TEXT NOT NULL)');
db.exec('CREATE TABLE IF NOT EXISTS entries(id INTEGER PRIMARY KEY,fullpath TEXT NOT NULL UNIQUE COLLATE NOCASE,name TEXT NOT NULL,kind TEXT NOT NULL,parent TEXT NOT NULL)');
db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS names_fts USING fts5(name,tokenize='trigram')");
db.exec('CREATE INDEX IF NOT EXISTS ix_parent ON entries(parent COLLATE NOCASE)');
const getMeta=db.prepare('SELECT val FROM meta WHERE key=?');
const setMeta=db.prepare('INSERT INTO meta(key,val) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET val=excluded.val');
if(getMeta.get('schema')?.val && getMeta.get('schema').val!=='desksom.self-healing/v1')throw Error('DB_SCHEMA_MISMATCH');
if(getMeta.get('root')?.val && getMeta.get('root').val!==norm(root))throw Error('DB_ROOT_MISMATCH');
const rows=db.prepare('SELECT id,fullpath,name,kind FROM entries WHERE parent=?');
const insert=db.prepare('INSERT INTO entries(fullpath,name,kind,parent) VALUES(?,?,?,?)');
const remove=db.prepare('DELETE FROM entries WHERE id=?');
const ftsAdd=db.prepare('INSERT INTO names_fts(rowid,name) VALUES(?,?)');
const buildAllFts=db.prepare('INSERT INTO names_fts(rowid,name) SELECT id,name FROM entries');
const ftsRemove=db.prepare('DELETE FROM names_fts WHERE rowid=?');
const updateName=db.prepare('UPDATE entries SET name=? WHERE id=?');
function refreshName(previous,name){ftsRemove.run(previous.id);updateName.run(name,previous.id);ftsAdd.run(previous.id,name)}
const subtree=db.prepare("SELECT id FROM entries WHERE fullpath=? OR fullpath LIKE ? ESCAPE '^'");
const mark=(state,why='')=>{setMeta.run('state',state);setMeta.run('reason',why);setMeta.run('updatedAt',new Date().toISOString())};
setMeta.run('schema','desksom.self-healing/v1');
setMeta.run('root',norm(root));
mark('STALE',existed?'Reopened after possible downtime':'New database, initial scan required');
let watcher=null,closed=false,dirty=new Set(),timer=null,failed=false,periodicTimer=null,watcherFailed=false;
let gapRecoveryTimer=null,gapRetryMs=1000,lastGapRecoveryAt=0;
let stats={fullScans:0,dirsRead:0,inserted:0,removed:0,events:0,updatedDirs:0,skippedLinks:0};
const msg=m=>parentPort?.postMessage(m);
if(writerLease.recoveredPriorBoot)msg({event:'PRIOR_BOOT_LEASE_RECOVERED'});
resources.clearTimers=()=>{clearTimeout(timer);clearInterval(periodicTimer);clearTimeout(gapRecoveryTimer)};
let scanStarted=Date.now(),scanEntries=0,scanDirs=0,lastProgress=0,scanPhase='INITIALIZING';
function reportProgress(phase=scanPhase,force=false){
 const now=Date.now();
 if(force||now-lastProgress>=250){
  lastProgress=now;
  msg({event:'INDEX_PROGRESS',progress:{phase,elapsedMs:now-scanStarted,
    directoriesVisited:stats.dirsRead-scanDirs,entriesVisited:scanEntries}});
 }
}
function beginScan(phase){
 checkStop();scanStarted=Date.now();scanEntries=0;scanDirs=stats.dirsRead;scanPhase=phase;
 reportProgress(phase,true);
}
function visitEntry(){checkStop();scanEntries++;if((scanEntries&1023)===0)reportProgress()}
function permitted(p){
 if(!inside(root,p))return false;
 try{const st=fs.lstatSync(p);if(st.isSymbolicLink())return false;
  return inside(root,fs.realpathSync.native(p));
 }catch{return false}
}
function transaction(fn){
 db.exec('BEGIN IMMEDIATE');
 try{const x=fn();db.exec('COMMIT');return x}
 catch(e){try{db.exec('ROLLBACK')}catch{};throw e}
}
function dropId(id){ftsRemove.run(id);remove.run(id);stats.removed++}
function dropTree(p){
 const key=norm(p);
 const ids=subtree.all(key,key.replace(/[\^%_]/g,c=>'^'+c)+'\\%');
 for(const {id} of ids)dropId(id);
}
function put(p,name,kind,parent){
 const id=Number(insert.run(norm(p),name,kind,norm(parent)).lastInsertRowid);
 ftsAdd.run(id,name);stats.inserted++;
}
function crawlDirectory(start,{deep=false}={}){
 const queue=[start],seen=new Set();
 while(queue.length){
  checkStop();
  const dir=queue.pop(),canonical=norm(dir);
  if(seen.has(canonical))continue;
  seen.add(canonical);
  if(!permitted(dir))throw Error('RECONCILE_ROOT_CHANGED');
  const old=rows.all(canonical);
  const known=new Map(old.map(x=>[norm(x.fullpath),x]));
  const members=fs.readdirSync(dir,{withFileTypes:true});
  stats.dirsRead++;
  const actual=new Map();
  for(const m of members){
   checkStop();
   const next=path.join(dir,m.name),key=norm(next);
   if(m.isSymbolicLink()||(!m.isDirectory()&&!m.isFile())){stats.skippedLinks++;continue}
   // Directory reparse points are excluded. Junctions are isSymbolicLink on Windows.
   if(!inside(root,next))continue;
   const kind=m.isDirectory()?'d':'f';
   actual.set(key,{next,name:m.name,kind});
  }
  for(const [key,value] of known)if(!actual.has(key)){
   if(value.kind==='d')dropTree(value.fullpath);
   else dropId(value.id);
  }
  for(const [key,value] of actual){
   const prev=known.get(key);
   if(!prev||prev.kind!==value.kind){
    if(prev){if(prev.kind==='d')dropTree(prev.fullpath);else dropId(prev.id)}
    put(value.next,value.name,value.kind,dir);
    if(value.kind==='d')queue.push(value.next);
   } else {
    if(prev.name!==value.name)refreshName(prev,value.name);
    if(deep&&value.kind==='d')queue.push(value.next);
   }
  }
 }
 return seen.size;
}
// First-time population deliberately avoids 40k SELECT-by-parent lookups.
// Differential comparison is for existing snapshots, not for empty databases.
function coldBuild(){
 const before=performance.now();
 const coldInsert=db.prepare('INSERT INTO entries(fullpath,name,kind,parent) VALUES(?,?,?,?)');
 try{
  beginScan('COLD_BUILD');
  transaction(()=>{
   const queue=[root];
   while(queue.length){
    checkStop();reportProgress();
    const dir=queue.pop();
    if(!permitted(dir))throw Error('INITIAL_ROOT_CHANGED');
    const members=fs.readdirSync(dir,{withFileTypes:true});
    stats.dirsRead++;
    for(const m of members){
     visitEntry();
     if(m.isSymbolicLink()||(!m.isDirectory()&&!m.isFile())){stats.skippedLinks++;continue}
     const full=path.join(dir,m.name);
     if(!inside(root,full))continue;
     coldInsert.run(norm(full),m.name,m.isDirectory()?'d':'f',norm(dir));stats.inserted++;
     if(m.isDirectory())queue.push(full);
    }
   }
   // Bulk-build FTS5 once. Per-entry token updates are reserved for live deltas.
   checkStop();reportProgress('BUILDING_SEARCH_INDEX',true);
   buildAllFts.run();checkStop();
   setMeta.run('lastFull',new Date().toISOString());
  });
  stats.fullScans++;failed=false;reportProgress('WATCHING',true);
  mark(watcher?'WATCHING_BEST_EFFORT':'SNAPSHOT','Cold build succeeded; negatives remain advisory');
  return {status:'RECONCILED',coldBuild:true,dirsVisited:stats.dirsRead,
   inserted:stats.inserted,removed:0,elapsedMs:Math.round(performance.now()-before),
   state:getMeta.get('state')?.val};
 }catch(e){failed=true;mark('STALE','Cold build failed '+(e.code??'ERROR'));
  return {status:'FAILED',coldBuild:true,code:e.code??'BUILD_ERROR'}}
}
// A rare full reconciliation uses one indexed path snapshot and one filesystem walk.
// Unchanged paths cause ZERO database writes: no per-directory SQL queries.
function diffFull(){
 const start=performance.now(),before={...stats};
 try{
  beginScan('FULL_RECONCILIATION');
  transaction(()=>{
   const prior=new Map(db.prepare('SELECT id,fullpath,name,kind FROM entries').all().map(x=>[norm(x.fullpath),x]));
   const stack=[root];
   while(stack.length){
    checkStop();reportProgress();
    const dir=stack.pop();
    if(!permitted(dir))throw Error('FULL_DIFF_DIRECTORY_UNAVAILABLE');
    const members=fs.readdirSync(dir,{withFileTypes:true});
    stats.dirsRead++;
    for(const m of members){
     visitEntry();
     if(m.isSymbolicLink()||(!m.isDirectory()&&!m.isFile())){stats.skippedLinks++;continue}
     const full=path.join(dir,m.name),key=norm(full),kind=m.isDirectory()?'d':'f';
     if(!inside(root,full))throw Error('FULL_DIFF_ESCAPED_ROOT');
     const before=prior.get(key);
     if(before){
      prior.delete(key);
      if(before.kind!==kind){dropId(before.id);put(full,m.name,kind,dir)}
      else if(before.name!==m.name)refreshName(before,m.name);
     }else put(full,m.name,kind,dir);
     if(kind==='d')stack.push(full);
    }
   }
   for(const stale of prior.values()){checkStop();dropId(stale.id)}
   setMeta.run('lastFull',new Date().toISOString());
  });
  stats.fullScans++;failed=false;reportProgress('WATCHING',true);
  // A broken watcher cannot guarantee live updates even after a full sweep.
  mark(watcherFailed?'STALE':watcher?'WATCHING_BEST_EFFORT':'SNAPSHOT',
    watcherFailed?'Watcher failed; full scan completed but live tracking unavailable':'Differential full walk completed; absence still advisory');
  const outcome={status:'RECONCILED',deep:true,optimizedDiff:true,
   inserted:stats.inserted-before.inserted,removed:stats.removed-before.removed,
   dirsVisited:stats.dirsRead-before.dirsRead,elapsedMs:Math.round(performance.now()-start),
   state:getMeta.get('state')?.val};
  if(!watcherFailed)msg({event:'INDEX_RECOVERED',result:outcome});
  else msg({event:'INDEX_DEGRADED'});
  return outcome;
 }catch(e){failed=true;mark('STALE','Differential full reconciliation failed: '+(e.code??'ERROR'));
  msg({event:'INDEX_DEGRADED',code:e.code??'FULL_DIFF_ERROR'});
  return {status:'FAILED',code:e.code??'FULL_DIFF_ERROR',state:'STALE'}}
}
function runDirs(paths,{deep=false,tag='DIRTY'}={}){
 if(closed)return {status:'CLOSED'};

 const before=performance.now(),initial={...stats},targets=new Set([...paths].map(norm).filter(p=>inside(root,p)));
 if(!targets.size)return {status:'NO_CHANGES',state:getMeta.get('state')?.val};
 try{
  transaction(()=>{
   for(const p of targets){
    // Parent changes may race against removal/rename; escalate to nearest existing ancestor.
    let ancestor=p;
    while(ancestor!==norm(root)&&!permitted(ancestor))ancestor=norm(path.dirname(ancestor));
    if(!permitted(ancestor))throw Error('WATCHED_ROOT_UNAVAILABLE');
    crawlDirectory(ancestor,{deep});
   }
   if(deep)setMeta.run('lastFull',new Date().toISOString());
  });
  if(deep){
   stats.fullScans++;failed=false;
   mark(watcherFailed?'STALE':watcher?'WATCHING_BEST_EFFORT':'SNAPSHOT',
     watcherFailed?'Watcher failed; live updates unavailable':'Full reconciliation completed, negatives still advisory');
   if(!watcherFailed)msg({event:'INDEX_RECOVERED',result:{status:'RECONCILED',state:getMeta.get('state')?.val}});
  }
  else if(!failed&&getMeta.get('state')?.val!=='STALE')mark('WATCHING_BEST_EFFORT','Dirty directories reconciled');
  stats.updatedDirs+=targets.size;
  return {status:'RECONCILED',deep,requestedDirs:targets.size,dirsVisited:stats.dirsRead-initial.dirsRead,
   inserted:stats.inserted-initial.inserted,removed:stats.removed-initial.removed,elapsedMs:Math.round(performance.now()-before),
   state:getMeta.get('state')?.val};
 }catch(e){failed=true;mark('STALE','Reconciliation failed: '+(e.code??'ERROR'));
  msg({event:'INDEX_DEGRADED'});
  return {status:'FAILED',code:e.code??'RECONCILE_ERROR',state:'STALE'}}
}
function drain(){
 if(timer){clearTimeout(timer);timer=null}
 const values=[...dirty];dirty.clear();
 return runDirs(values);
}
function enqueue(p){
 if(!inside(root,p))return;
 dirty.add(norm(p));
 if(timer)return;
 timer=setTimeout(()=>{drain()},150);
}
function full(){return diffFull()}
function scheduleNotificationGapRecovery(){
 // An unnamed notification invalidates event coverage, not writer ownership.
 // Reconcile the same approved root promptly instead of waiting 30 minutes.
 // Coalesce bursts, limit repeated successful sweeps to once per five seconds,
 // and back off failed sweeps. Never mark READY merely because a timer fired.
 if(closed||watcherFailed||gapRecoveryTimer)return;
 const delay=Math.max(gapRetryMs,lastGapRecoveryAt+5000-Date.now());
 gapRecoveryTimer=setTimeout(()=>{
  gapRecoveryTimer=null;
  if(closed||watcherFailed||!failed)return;
  lastGapRecoveryAt=Date.now();
  const result=full();
  msg({event:'NOTIFICATION_GAP_RECONCILIATION',result});
  if(result.status==='RECONCILED'&&result.state!=='STALE')gapRetryMs=1000;
  else{gapRetryMs=Math.min(gapRetryMs*2,30000);scheduleNotificationGapRecovery();}
 },delay);
 gapRecoveryTimer.unref();
}
function handler(m){
 try{
  const op=m.op,req=m.id;
  let result;
  if(op==='flush')result=drain();
  else if(op==='touch'){
   for(const p of m.paths??[])if(typeof p==='string'&&inside(root,p))enqueue(path.dirname(p));
   result=drain();
  }
  else if(op==='full')result=full();
  else if(op==='periodic')result=diffFull();
  else if(op==='status')result={state:getMeta.get('state')?.val,reason:getMeta.get('reason')?.val,
   lastFull:getMeta.get('lastFull')?.val,dirtyDirs:dirty.size,stats,dbFile,root,periodicReconcileMs:period,writerLeaseHeld:true};
  else if(op==='stop'){
   if(timer)clearTimeout(timer);
   if(periodicTimer)clearInterval(periodicTimer);
   if(gapRecoveryTimer){clearTimeout(gapRecoveryTimer);gapRecoveryTimer=null;}
   // Dirty hints are derived state, not queued user writes. A future startup
   // reconciles them; do not start another expensive scan during shutdown.
   dirty.clear();
   watcher?.close();mark('STALE','Worker closed; possible changes after shutdown');
   db.close();writerLease.release();closed=true;
   result={status:'STOPPED',writerLeaseReleased:true};
   msg({id:req,result});setImmediate(()=>process.exit(0));return;
  }
  else throw Error('UNKNOWN_OPERATION');
  msg({id:req,result});
 }catch(e){msg({id:m.id,error:e.code??'WORKER_ERROR'})}
}
parentPort.on('message',handler);
try{
 watcher=resources.watcher=fs.watch(root,{recursive:true},(type,filename)=>{
  stats.events++;
  if(!filename){failed=true;mark('STALE','Watcher reported event without filename');msg({event:'INDEX_DEGRADED'});scheduleNotificationGapRecovery();return}
  const changed=path.resolve(root,String(filename));
  if(inside(root,changed))enqueue(path.dirname(changed));
 });
 watcher.on('error',e=>{watcherFailed=true;failed=true;mark('STALE','Watcher error '+(e.code??'ERROR'));msg({event:'INDEX_DEGRADED'})});
 msg({event:'WATCH_ATTACHED'});
 const initial=db.prepare('SELECT COUNT(*) n FROM entries').get().n===0?coldBuild():diffFull();
 msg({event:'INITIAL_RECONCILIATION',result:initial});
 if(!closed){
  periodicTimer=setInterval(()=>{
   if(closed)return;
   const result=diffFull();
   msg({event:'PERIODIC_RECONCILIATION',result});
  },period);
  periodicTimer.unref();
 }
}catch(e){failed=true;mark('STALE','Watcher setup failed: '+(e.code??'ERROR'));msg({event:'INITIAL_ERROR',code:e.code??'ERROR'})}

}
try{startWorker()}catch(error){
 let cleanupConfirmed=true;
 try{resources.clearTimers?.();resources.watcher?.close()}catch{cleanupConfirmed=false}
 try{resources.database?.close()}catch{cleanupConfirmed=false}
 if(cleanupConfirmed){try{resources.lease?.release()}catch{cleanupConfirmed=false}}
 parentPort.removeAllListeners('message');
 const raw=error?.code??error?.message;
 const code=typeof raw==='string'&&/^[A-Z0-9_]{1,80}$/.test(raw)?raw:'INDEX_INITIALIZATION_FAILED';
 parentPort.postMessage({event:'INITIAL_ERROR',fatal:true,code});
 // Remain reachable for an explicit, acknowledged stop. A startup error alone
 // is NOT a successful shutdown. A foreign/retained lease keeps stop unconfirmed.
 parentPort.on('message',m=>{
  if(m.op!=='stop')return parentPort.postMessage({id:m.id,error:code});
  const released=cleanupConfirmed&&indexWriterLeaseAbsent(workerData.database);
  parentPort.postMessage({id:m.id,result:{status:released?'STOPPED':'UNCONFIRMED',writerLeaseReleased:released}});
  setImmediate(()=>process.exit(released?0:25));
 });
}
