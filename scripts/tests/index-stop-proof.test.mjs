import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createFastFileSearch} from '../../fast-files.mjs';
import {indexWriterLeaseAbsent} from '../../index-writer-lock.mjs';

// The production client logic is unchanged in the fixture; only the Worker
// import and the location of its real lease-proof helper are redirected.
async function synthetic(){
 const base=fs.mkdtempSync(path.join(import.meta.dirname,'stop-proof-fixture-'));
 const database=path.join(base,'index.sqlite'),lock=database+'.writer-lock';
 fs.mkdirSync(lock);
 const mock=path.join(base,'MOCK_WORKER.mjs');
 fs.writeFileSync(mock,"import {EventEmitter} from 'node:events';\nexport class Worker extends EventEmitter {\n static instances=[];\n constructor(){super();this.messages=[];this.terminations=0;Worker.instances.push(this)}\n postMessage(message){this.messages.push(message)}\n terminate(){this.terminations++;this.emit('exit',1);return Promise.resolve(1)}\n}\n",{flag:'wx'});
 const source=fs.readFileSync(path.resolve(import.meta.dirname,'../../self-healing-client.mjs'),'utf8');
 const workerImport="import {Worker} from 'node:worker_threads';";
 const proofImport="import {indexWriterLeaseAbsent} from './index-writer-lock.mjs';";
 assert.equal(source.split(workerImport).length,2);assert.equal(source.split(proofImport).length,2);
 const body=source.replace(workerImport,"import {Worker} from './MOCK_WORKER.mjs';")
  .replace(proofImport,"import {indexWriterLeaseAbsent} from '"+pathToFileURL(path.resolve(import.meta.dirname,'../../index-writer-lock.mjs')).href+"';");
 const copied=path.join(base,'client.SYNTHETIC.mjs');fs.writeFileSync(copied,body,{flag:'wx'});
 const {Worker}=await import(pathToFileURL(mock).href);
 const {startSelfHealingIndex}=await import(pathToFileURL(copied).href);
 const index=startSelfHealingIndex({root:base,database,privateState:base});
 const worker=Worker.instances[0];
 const ack=(id,extra={writerLeaseReleased:true})=>worker.emit('message',{id,result:{status:'STOPPED',...extra}});
 const release=()=>fs.rmdirSync(lock);
 return {base,database,lock,index,worker,ack,release};
}

const denied=[
 ['nonzero exit before ACK',f=>f.worker.emit('exit',1)],
 ['zero exit without ACK',f=>f.worker.emit('exit',0)],
 ['error then exit while stop pending',f=>{f.worker.emit('error',new Error('fixture failure'));f.worker.emit('exit',1)}],
 ['foreign request ACK cannot confirm stop',(f,id)=>{f.release();f.ack(id+1);f.worker.emit('exit',0)}],
 ['bare STOPPED response is not proof',(f,id)=>{f.release();f.ack(id,{});f.worker.emit('exit',0)}],
 ['ACK with false release flag',(f,id)=>{f.release();f.ack(id,{writerLeaseReleased:false});f.worker.emit('exit',0)}],
 ['ACK and exit with retained lease',(f,id)=>{f.ack(id);f.worker.emit('exit',0)}],
 ['ACK followed by abnormal exit',(f,id)=>{f.release();f.ack(id);f.worker.emit('exit',1)}],
 ['ACK followed by error and zero exit',(f,id)=>{f.release();f.ack(id);f.worker.emit('error',new Error('fixture failure'));f.worker.emit('exit',0)}]
];
for(const [label,inject] of denied)test('stop proof: '+label,async()=>{
 const f=await synthetic(),promise=f.index.stop(),id=f.worker.messages[0].id;
 inject(f,id);
 const outcome=await promise;
 assert.equal(outcome.status,'UNCONFIRMED');assert.equal(outcome.writerLeaseReleased,false);
 assert.notEqual(f.index.latest,'STOPPED');
 assert.strictEqual(f.index.stop(),promise,'Repeated stop must not replay an ambiguous request');
 assert.equal(f.worker.messages.length,1);assert.equal(f.worker.terminations,0);
});

test('stop proof: error before stop never posts a new operation',async()=>{
 const f=await synthetic();f.worker.emit('error',new Error('reviewer ordering'));
 const promise=f.index.stop();f.worker.emit('exit',1);
 assert.equal((await promise).status,'UNCONFIRMED');
 assert.equal(f.index.latest,'FAILED');assert.equal(f.worker.messages.length,0);
 assert.equal(fs.existsSync(f.lock),true);
});
test('stop proof: exact ACK, normal exit and absent lease succeed even in the same tick',async()=>{
 const f=await synthetic(),promise=f.index.stop();
 assert.strictEqual(f.index.stop(),promise);assert.strictEqual(f.index.call('stop'),promise);
 const id=f.worker.messages[0].id;f.release();f.ack(id);f.worker.emit('exit',0);
 assert.deepEqual(await promise,{status:'STOPPED',writerLeaseReleased:true,gracefulExit:true});
 assert.equal(f.index.latest,'STOPPED');assert.equal(f.worker.messages.length,1);
 assert.equal(f.worker.terminations,0);
});
test('stop proof: missing ACK times out without forced termination or replay',async()=>{
 const f=await synthetic(),promise=f.index.stop();
 assert.equal((await promise).status,'UNCONFIRMED');
 assert.strictEqual(f.index.stop(),promise);assert.equal(f.worker.messages.length,1);
 assert.equal(f.worker.terminations,0);assert.equal(fs.existsSync(f.lock),true);
 f.worker.emit('exit',1);
});
test('stop proof: ACK alone does not prove worker exit',async()=>{
 const f=await synthetic(),promise=f.index.stop(),id=f.worker.messages[0].id;
 f.release();f.ack(id);
 assert.equal((await promise).status,'UNCONFIRMED');assert.equal(f.worker.terminations,0);
 f.worker.emit('exit',0);
 assert.notEqual(f.index.latest,'STOPPED');
});

test('aggregate proof rechecks a retained/reappeared lease instead of trusting cached STOPPED',async()=>{
 const base=fs.mkdtempSync(path.join(import.meta.dirname,'stop-proof-live-'));
 const root=path.join(base,'root'),state=path.join(base,'private'),database=path.join(state,'index.sqlite');
 fs.mkdirSync(root);fs.mkdirSync(state);fs.writeFileSync(path.join(root,'positive.txt'),'disposable');
 const index=createFastFileSearch({stateDir:state,allowedDirectories:[root],fastFilenameIndex:{
  enabled:true,selfHealing:true,periodicReconcileMs:300000,indices:[{root,database}]}});
 assert.equal((await index.ready()).status,'READY');
 const stopped=await index.stop();assert.equal(stopped.status,'STOPPED');assert.equal(stopped.writerLeaseReleased,true);
 assert.equal(indexWriterLeaseAbsent(database),true);
 fs.mkdirSync(database+'.writer-lock'); // New fixture-only evidence, never a live lease removed.
 const blocked=await index.stop();assert.equal(blocked.status,'UNCONFIRMED');assert.equal(blocked.writerLeaseReleased,false);
 assert.equal(indexWriterLeaseAbsent(database),false);assert.equal(fs.existsSync(database+'.writer-lock'),true);
});
