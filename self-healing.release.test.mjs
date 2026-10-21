import {fixturePrefix} from './scripts/tests/fixture-paths.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {startSelfHealingIndex} from './self-healing-client.mjs';

const base=fs.mkdtempSync(fixturePrefix('self-healing-locktest-'));
const root=path.join(base,'fixture'),privateState=path.join(base,'private');
fs.mkdirSync(root);fs.mkdirSync(privateState);
const database=path.join(privateState,'data.sqlite');
fs.writeFileSync(path.join(root,'initial.txt'),'fixture');
const inputs={root,database,privateState,periodicReconcileMs:300,fixtureOnly:true};
async function wait(pred,ms=8500){
 const start=Date.now();
 while(Date.now()-start<ms){if(await pred())return true;await new Promise(r=>setTimeout(r,55))}
 return false;
}
const a=startSelfHealingIndex(inputs);
assert.ok(await wait(()=>a.latest==='READY'),a.latest);
const lease=database+'.writer-lock',marker=path.join(lease,'owner.json');
assert.ok(fs.existsSync(marker));
const meta=JSON.parse(fs.readFileSync(marker,'utf8'));
const b=startSelfHealingIndex(inputs);
assert.ok(await wait(()=>b.latest==='FAILED'||b.latest==='STOPPED',3500),'Duplicate writer unexpectedly started');
assert.equal(JSON.parse(fs.readFileSync(marker,'utf8')).token,meta.token,'Duplicate changed writer ownership');
assert.equal((await b.stop()).status,'UNCONFIRMED','A foreign lease is not ours to release');
assert.ok(await wait(async()=>{
 const s=await a.call('status',{},1000);
 return s?.stats?.fullScans>=2;
},6000),'Periodic full-reconciliation timer did not run');
const periodic=await a.call('status',{},2500);
assert.equal(periodic.periodicReconcileMs,300);
assert.equal(periodic.writerLeaseHeld,true);
assert.ok(periodic.stats.fullScans>=2);
assert.equal((await a.stop()).status,'STOPPED');
assert.ok(!fs.existsSync(lease),'Graceful stop did not release owned lease');

const c=startSelfHealingIndex(inputs);
assert.ok(await wait(()=>c.latest==='READY'),c.latest);
// Abrupt worker death intentionally preserves a fail-closed lock.
const beforeCrash=JSON.parse(fs.readFileSync(marker,'utf8'));
await c.terminateForFixture();
assert.ok(fs.existsSync(marker),'Crash unexpectedly removed writer lock');
const d=startSelfHealingIndex(inputs);
assert.ok(await wait(()=>d.latest==='FAILED'||d.latest==='STOPPED',3000),'Stale lock was silently stolen');
assert.equal(JSON.parse(fs.readFileSync(marker,'utf8')).token,beforeCrash.token);
assert.equal((await d.stop()).status,'UNCONFIRMED','The crash-held lease still requires reconciliation');
// Manual, fixture-only reconcile after positively confirming c has exited.
if(!base.toLowerCase().includes('\\ops\\self-healing-locktest-'))throw Error('NOT_A_FIXTURE');
if(JSON.parse(fs.readFileSync(marker,'utf8')).token!==beforeCrash.token)throw Error('STALE_LOCK_OWNER_DRIFT');
fs.unlinkSync(marker);fs.rmdirSync(lease);
const e=startSelfHealingIndex(inputs);
assert.ok(await wait(()=>e.latest==='READY'),e.latest);
await e.stop();
assert.ok(!fs.existsSync(lease));
const result={status:'SELF_HEALING_RELEASE_GATES_PASS',periodicTimerObserved:true,periodicScans:periodic.stats.fullScans,
 duplicateWriterRejected:true,gracefulLeaseRelease:true,crashLeaseHeld:true,
 staleLeaseStealRejected:true,manualReconciliationRequired:true,sourceOnly:true,base};
fs.writeFileSync(path.join(base,'RELEASE_TEST_RESULTS.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
