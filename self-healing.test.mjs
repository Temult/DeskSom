import {fixturePrefix} from './scripts/tests/fixture-paths.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
const base=fs.mkdtempSync(fixturePrefix('self-healing-test-'));
const root=path.join(base,'fixture'),privateState=path.join(base,'private');
fs.mkdirSync(root);fs.mkdirSync(privateState);
const dbfile=path.join(privateState,'index.sqlite');
const workerFile=new URL('./self-healing-worker.mjs',import.meta.url);
const testpath=(name)=>path.join(root,name);
fs.mkdirSync(testpath('old-folder'));
fs.writeFileSync(testpath('old-folder\\legacy-one.txt'),'test');
let requestId=0;
function boot(){
 const w=new Worker(workerFile,{workerData:{root,database:dbfile,privateState,approvedRoot:root}});
 const pending=new Map();
 let events=[];
 w.on('message',m=>{if('id' in m){const x=pending.get(m.id);if(x){clearTimeout(x.timer);pending.delete(m.id);x.resolve(m.result??{error:m.error})}}else events.push(m)});
 function call(op,payload={},timeout=25000){
  return new Promise((resolve,reject)=>{
   const id=++requestId;
   const timer=setTimeout(()=>{pending.delete(id);reject(Error('WORKER_TIMEOUT '+op))},timeout);
   pending.set(id,{resolve,reject,timer});w.postMessage({id,op,...payload});
  });
 }
 async function ready(){
  const started=Date.now();
  while(!events.some(e=>e.event==='INITIAL_RECONCILIATION'||e.event==='INITIAL_ERROR')){
   if(Date.now()-started>25000)throw Error('START_TIMEOUT '+JSON.stringify(events));
   await new Promise(r=>setTimeout(r,35));
  }
  assert.equal(events.find(x=>x.event==='INITIAL_RECONCILIATION')?.result?.status,'RECONCILED',JSON.stringify(events));
 }
 async function stop(){const result=await call('stop');assert.equal(result.status,'STOPPED');await w.terminate()}
 return {w,call,ready,stop,events};
}
function count(q){
 const d=new DatabaseSync(dbfile,{readOnly:true});
 try{
  const n=d.prepare("SELECT COUNT(*) n FROM entries WHERE name LIKE ?").get('%'+q+'%').n;
  return n;
 }finally{d.close()}
}
async function waitFor(fn,ms=4500){
 const deadline=Date.now()+ms;
 while(Date.now()<deadline){
  if(fn())return true;
  await new Promise(r=>setTimeout(r,45));
 }return false;
}
const a=boot();await a.ready();
assert.equal(count('legacy-one'),1);
const newFile=testpath('fresh-download-719.zip');
fs.writeFileSync(newFile,'download');
assert.ok(await waitFor(()=>count('fresh-download')===1),'WATCHER_DID_NOT_ADD_DOWNLOAD');
fs.renameSync(newFile,testpath('renamed-download-719.zip'));
assert.ok(await waitFor(()=>count('renamed-download')===1 && count('fresh-download')===0),'WATCHER_RENAME_INCOMPLETE');
fs.unlinkSync(testpath('renamed-download-719.zip'));
assert.ok(await waitFor(()=>count('renamed-download')===0),'WATCHER_DELETE_INCOMPLETE');
fs.mkdirSync(testpath('new-subdir'));
fs.writeFileSync(testpath('new-subdir\\nested-abc.txt'),'nested');
assert.ok(await waitFor(()=>count('nested-abc')===1),'NEW_DIRECTORY_SUBTREE_MISSED');
fs.renameSync(testpath('old-folder'),testpath('moved-folder'));
assert.ok(await waitFor(()=>count('legacy-one')===1 && (()=>{const d=new DatabaseSync(dbfile,{readOnly:true});try{return d.prepare("SELECT fullpath FROM entries WHERE name='legacy-one.txt'").get()?.fullpath.includes('moved-folder')}finally{d.close()}})()),'DIRECTORY_RENAME_FAILED');
const created=testpath('agent-created-write-812.txt');
fs.writeFileSync(created,'agent');
const touch=await a.call('touch',{paths:[created]});
assert.equal(touch.status,'RECONCILED');
assert.equal(count('agent-created-write'),1);
const initialStatus=await a.call('status');
assert.equal(initialStatus.state,'WATCHING_BEST_EFFORT');
await a.stop();
const offline=testpath('while-offline-330.txt');
fs.writeFileSync(offline,'missed event');
const b=boot();await b.ready();
assert.equal(count('while-offline-330'),1,'OFFLINE_CATCHUP_FAILED');
const after=await b.call('status');
assert.equal(after.state,'WATCHING_BEST_EFFORT');
assert.ok(after.stats.fullScans===1);
await b.stop();
const out={status:'SELF_HEALING_PASS',watcherAdd:true,watcherRename:true,watcherDelete:true,
 subtreeDiscovery:true,directoryRename:true,writeThrough:true,restartRecovery:true,
 absenceAuthoritative:false,isolated:true,base};
fs.writeFileSync(path.join(base,'TEST_RESULTS.json'),JSON.stringify(out,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(out));
