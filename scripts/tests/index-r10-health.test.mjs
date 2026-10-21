import {fixturePrefix} from './fixture-paths.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {startSelfHealingIndex} from '../../self-healing-client.mjs';

// Real Windows filesystem test, isolated in a new owned fixture. No installed service.
function fixture(){
 const base=fs.mkdtempSync(fixturePrefix('self-healing-r10-health-'));
 const root=path.join(base,'root'),state=path.join(base,'state');
 fs.mkdirSync(root);fs.mkdirSync(state);
 fs.writeFileSync(path.join(root,'positive.txt'),'fixture');
 return {base,root,state,db:path.join(state,'index.sqlite')};
}
function make(f){return startSelfHealingIndex({root:f.root,database:f.db,privateState:f.state,periodicReconcileMs:300000,fixtureOnly:true})}
test('periodic failure invalidates READY; only a complete subsequent full scan restores it',async()=>{
 const f=fixture(),index=make(f);
 assert.equal((await index.whenReady()).status,'READY');
 const lease=f.db+'.writer-lock',missing=f.root+'.temporarily-moved';
 try{
  fs.renameSync(f.root,missing);
  const broken=await index.call('periodic',{},18000);
  assert.equal(broken.status,'FAILED');
  assert.equal(index.latest,'STALE','Worker cannot report READY while SQLite metadata is STALE');
  const state=await index.call('status',{},1000);
  assert.equal(state.state,'STALE');
  fs.renameSync(missing,f.root);
  const recovered=await index.call('full',{},18000);
  assert.equal(recovered.status,'RECONCILED');
  assert.equal(recovered.state,'WATCHING_BEST_EFFORT');
  assert.equal(index.latest,'READY','Only verified full reconciliation restores readiness');
 }finally{
  if(fs.existsSync(missing)&&!fs.existsSync(f.root))fs.renameSync(missing,f.root);
  assert.equal((await index.stop()).status,'STOPPED');
  assert.equal(fs.existsSync(lease),false,'Owner shutdown must release index writer lease');
 }
});
test('failed dirty-directory reconciliation also invalidates READY',async()=>{
 const f=fixture(),index=make(f),missing=f.root+'.temporarily-moved';
 assert.equal((await index.whenReady()).status,'READY');
 try{
  fs.renameSync(f.root,missing);
  const failed=await index.call('touch',{paths:[path.join(f.root,'positive.txt')]},18000);
  assert.equal(failed.status,'FAILED');
  assert.equal(index.latest,'STALE');
  fs.renameSync(missing,f.root);
  assert.equal((await index.call('full',{},18000)).status,'RECONCILED');
  assert.equal(index.latest,'READY');
 }finally{
  if(fs.existsSync(missing)&&!fs.existsSync(f.root))fs.renameSync(missing,f.root);
  assert.equal((await index.stop()).status,'STOPPED');
 }
});
