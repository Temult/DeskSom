import {fixturePrefix} from './fixture-paths.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {makePlan,settings,taskDefinition} from '../lib/install-core.mjs';
import {hashObject,atomicJson} from '../lib/common.mjs';
import {checkIndexNode,planIndex,applyIndex,rollbackIndex,listIndex} from '../lib/index-control.mjs';

const q=path.win32.normalize;
async function fixture(){
 const working=await fs.mkdtemp(fixturePrefix('index-config-qa-'));
 const stateRoot=q(path.join(working,'state'));
 const allowed=q(path.join(working,'allowed'));
 await fs.mkdir(allowed,{recursive:true});await fs.mkdir(stateRoot);
 const core={
  schemaVersion:'desksom.plan/v1',
  sourceRoot:q(path.join(working,'source')),sourceFingerprint:'a'.repeat(64),version:'0.2.0-rc.13',
  instance:'unit',installRoot:q(path.join(working,'install')),stateRoot,allowedDirectories:[allowed.toLowerCase()],
  port:19887,binding:{host:'DESKTOP-QA',sid:'S-1-5-21-111-222-333-1001',architecture:'x64'},
  tasks:{local:'DeskSom-unit-Local',tunnel:'DeskSom-unit-Tunnel'},
  permissions:{shell:'FULL_WINDOWS_USER_PERMISSIONS_NOT_A_SANDBOX',elevated:false,publicInboundPort:false},
  downloads:{},externalRequirements:[]
 };
 const plan={...core,planSha256:hashObject(core)};
 const state={schemaVersion:'desksom.install/v1',plan,planSha256:plan.planSha256,
  installationId:'11111111-1111-4111-8111-111111111111',
  completed:{local_task:{at:'2026-10-18'}},activeAllowedDirectories:plan.allowedDirectories,
  rootsRevision:2,credentialsConfigured:false,operatorStopped:false,phase:'LOCAL_READY',
  environment:{wscript:'C:\\Windows\\System32\\wscript.exe'},
  runtimeRoot:q(path.join(working,'install','runtime'))};
 await atomicJson(path.join(stateRoot,'install.json'),state);
 await atomicJson(path.join(stateRoot,'settings.json'),await settings(state));
 const task={...taskDefinition(plan,state,'local'),state:'Running',enabled:true};
 let running=true,healthStale=false,simulateStopFailure=false,simulateTaskDrift=false,stopCount=0,startCount=0,enableCount=0,privateCount=0;
 const platform={
  async lock(){return {release:async()=>{}}},
  async taskGet(n){return n===task.name?task:null},
  async probe(){return running?{ready:!healthStale,bootId:'22222222-2222-4222-8222-222222222222',host:plan.binding.host,instance:plan.instance,version:plan.version,
   installationId:state.installationId,sourceFingerprint:plan.sourceFingerprint,activeCalls:0}:{ready:false}},
  async runtimeProcesses(){return {count:0}},
  async portOwner(){return false},
  async protectDirectory(p){privateCount++;await fs.mkdir(p,{recursive:true})},
  async stopService(){stopCount++;if(simulateStopFailure)throw Error('TEST_STOP_INTERRUPTED');running=false;task.enabled=false;task.state='Disabled';if(simulateTaskDrift)task.arguments+=' --changed'},
  async taskEnable(){enableCount++;task.enabled=true;task.state='Ready'},
  async taskStart(){startCount++;running=true;healthStale=false;task.state='Running'},
  async waitReady(){return this.probe()},
  async environment(){return {host:plan.binding.host,sid:plan.binding.sid}}
 };
 const load=async()=>JSON.parse(await fs.readFile(path.join(stateRoot,'install.json'),'utf8'));
 const get=()=>load();
 return {working,source:plan.sourceRoot,stateRoot,allowed,state,platform,load,get,
  get stops(){return stopCount},get starts(){return startCount},get enables(){return enableCount},get privateCount(){return privateCount},
  setIndexStale:(value=true)=>{healthStale=value},
  failStop:()=>{simulateStopFailure=true},clearStopFailure:()=>{simulateStopFailure=false},
  disableOwnerTask:()=>{running=false;task.enabled=false;task.state='Disabled'},
  driftTaskOnStop:()=>{simulateTaskDrift=true},
  repairMockStop:()=>{simulateStopFailure=false;running=false;task.state='Ready'}};
}
test('Node version gate applies only to indexing',()=>{
 assert.throws(()=>checkIndexNode('22.5.0'),/Indexed search currently requires Node.js 25/);
 assert.doesNotThrow(()=>checkIndexNode('25.2.1'));
});
test('reviewed owner apply updates only private profile, restarts exactly once, and disables cleanly',async()=>{
 const f=await fixture();
 const planned=await planIndex(f.source,f.stateRoot,{enabled:true,roots:[f.allowed],periodicMinutes:30},f.platform,{load:f.load});
 assert.equal(planned.status,'INDEX_PLAN_READY');
 assert.equal(planned.proposal.indices.length,1);
 assert.equal(f.stops,0);
 const applied=await applyIndex(f.source,f.stateRoot,planned.proposal,planned.proposal.approvalSha256,true,f.platform,{load:f.load});
 assert.equal(applied.status,'INDEX_UPDATED');
 assert.equal(f.stops,1);assert.equal(f.starts,1);assert.equal(f.enables,1);assert.equal(f.privateCount,1);
 const state=await f.get();
 assert.equal(state.indexProfile.enabled,true);assert.equal(state.pendingIndexChange,null);
 assert.equal(state.operatorStopped,false);
 const conf=JSON.parse(await fs.readFile(path.join(f.stateRoot,'settings.json'),'utf8'));
 assert.deepEqual(conf.fastFilenameIndex.indices.map(x=>x.root),[f.allowed.toLowerCase()]);
 const list=await listIndex(f.source,f.stateRoot,f.platform,{load:f.load});
 assert.equal(list.enabled,true);
 const planOff=await planIndex(f.source,f.stateRoot,{enabled:false,roots:[],periodicMinutes:30},f.platform,{load:f.load});
 assert.equal((await applyIndex(f.source,f.stateRoot,planOff.proposal,planOff.proposal.approvalSha256,true,f.platform,{load:f.load})).enabled,false);
 assert.equal(f.stops,2);assert.equal(f.starts,2);assert.equal(f.enables,2);
 const disabled=JSON.parse(await fs.readFile(path.join(f.stateRoot,'settings.json'),'utf8'));
 assert.equal(disabled.fastFilenameIndex.enabled,false);
});
test('temporarily stale index remains exact owner and can be quiesced before restart',async()=>{
 const f=await fixture();
 const planned=await planIndex(f.source,f.stateRoot,{enabled:true,roots:[f.allowed],periodicMinutes:30},f.platform,{load:f.load});
 f.setIndexStale();
 const result=await applyIndex(f.source,f.stateRoot,planned.proposal,planned.proposal.approvalSha256,true,f.platform,{load:f.load});
 assert.equal(result.status,'INDEX_UPDATED');
 assert.equal(f.stops,1);assert.equal(f.starts,1);
 assert.equal((await f.get()).operatorStopped,false);
 assert.equal((await f.get()).pendingIndexChange,null);
});
test('no consent or stale digest means no stopped services and no effects',async()=>{
 const f=await fixture();
 const planned=await planIndex(f.source,f.stateRoot,{enabled:true,roots:[f.allowed]},f.platform,{load:f.load});
 await assert.rejects(()=>applyIndex(f.source,f.stateRoot,planned.proposal,'incorrect',true,f.platform,{load:f.load}),/Exact proposal hash/);
 await assert.rejects(()=>applyIndex(f.source,f.stateRoot,{...planned.proposal,rootsRevision:3},planned.proposal.approvalSha256,true,f.platform,{load:f.load}),/Approved index plan is stale/);
 assert.equal(f.stops,0);assert.equal(f.privateCount,0);
 assert.equal((await f.get()).pendingIndexChange,undefined);
});
test('an initially owner-disabled task is not silently re-enabled',async()=>{
 const f=await fixture();
 const plan=await planIndex(f.source,f.stateRoot,{enabled:true,roots:[f.allowed]},f.platform,{load:f.load});
 f.disableOwnerTask();
 await assert.rejects(()=>applyIndex(f.source,f.stateRoot,plan.proposal,plan.proposal.approvalSha256,true,f.platform,{load:f.load}),/Stop or repair the existing service/);
 assert.equal(f.stops,0);assert.equal(f.starts,0);assert.equal(f.enables,0);
 assert.equal((await f.get()).pendingIndexChange,undefined);
});
test('task identity drift after stop blocks re-enable and retains recovery intent',async()=>{
 const f=await fixture();
 const plan=await planIndex(f.source,f.stateRoot,{enabled:true,roots:[f.allowed]},f.platform,{load:f.load});
 f.driftTaskOnStop();
 await assert.rejects(()=>applyIndex(f.source,f.stateRoot,plan.proposal,plan.proposal.approvalSha256,true,f.platform,{load:f.load}),/owned task changed/);
 assert.equal(f.stops,1);assert.equal(f.starts,0);assert.equal(f.enables,0);
 assert.equal((await f.get()).pendingIndexChange.phase,'CONFIG_WRITTEN');
});
test('interrupted service stop blocks replay; explicit rollback restores settings but does not start',async()=>{
 const f=await fixture();
 const plan=await planIndex(f.source,f.stateRoot,{enabled:true,roots:[f.allowed]},f.platform,{load:f.load});
 f.failStop();
 await assert.rejects(()=>applyIndex(f.source,f.stateRoot,plan.proposal,plan.proposal.approvalSha256,true,f.platform,{load:f.load}),/TEST_STOP_INTERRUPTED/);
 assert.equal((await f.get()).pendingIndexChange.phase,'INTENT');
 assert.equal(f.starts,0);
 f.clearStopFailure();
 const receipt=await rollbackIndex(f.stateRoot,true,f.platform);
 assert.equal(receipt.status,'INDEX_ROLLED_BACK_STOPPED');
 assert.equal((await f.get()).operatorStopped,true);
 assert.equal((await f.get()).pendingIndexChange,null);
 assert.equal(f.starts,0);
 const conf=JSON.parse(await fs.readFile(path.join(f.stateRoot,'settings.json'),'utf8'));
 assert.equal(conf.fastFilenameIndex,undefined);
});
