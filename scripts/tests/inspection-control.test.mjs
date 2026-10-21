import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';
import {fixturePrefix} from './fixture-paths.mjs';
import {settings,taskDefinition} from '../lib/install-core.mjs';
import {hashObject,atomicJson} from '../lib/common.mjs';
import {listInspection,planInspection,applyInspection,rollbackInspection} from '../lib/inspection-control.mjs';
import {parseArgs} from '../cli.mjs';
async function fixture({stopped=false}={}){
 const base=await fs.mkdtemp(fixturePrefix('inspection-control-')),stateRoot=path.join(base,'state'),allowed=path.join(base,'allowed');
 await fs.mkdir(stateRoot);await fs.mkdir(allowed);
 const core={schemaVersion:'desksom.plan/v1',sourceRoot:path.join(base,'source'),sourceFingerprint:'a'.repeat(64),version:'0.2.0-rc.14',
  instance:'fixture',installRoot:path.join(base,'install'),stateRoot,allowedDirectories:[allowed],port:19989,
  binding:{host:'QA-HOST',sid:'S-1-5-21-111-222-333-1001',architecture:'x64'},tasks:{local:'DeskSom-fixture-Local',tunnel:'DeskSom-fixture-Tunnel'},
  permissions:{shell:'FULL_WINDOWS_USER_PERMISSIONS_NOT_A_SANDBOX',elevated:false,publicInboundPort:false},downloads:{},externalRequirements:[]};
 const plan={...core,planSha256:hashObject(core)};
 const state={schemaVersion:'desksom.install/v1',plan,planSha256:plan.planSha256,installationId:'11111111-1111-4111-8111-111111111111',
  runtimeRoot:path.join(core.installRoot,'runtime'),environment:{wscript:'C:\\Windows\\System32\\wscript.exe'},completed:{local_task:{}},
  activeAllowedDirectories:[allowed],rootsRevision:2,credentialsConfigured:true,operatorStopped:stopped,phase:stopped?'STOPPED':'TUNNEL_READY'};
 await atomicJson(path.join(stateRoot,'install.json'),state);await atomicJson(path.join(stateRoot,'settings.json'),await settings(state));
 const task={...taskDefinition(plan,state,'local'),enabled:!stopped,state:stopped?'Disabled':'Running'};
 let running=!stopped,active=0,foreign=false,failStop=false,failStart=false,drift=false,stops=0,starts=0,enables=0;
 const load=async()=>JSON.parse(await fs.readFile(path.join(stateRoot,'install.json'),'utf8'));
 const platform={
  async lock(){return {release:async()=>{}}},async taskGet(name){assert.equal(name,plan.tasks.local,'Tunnel must not be mutated or restarted');return task},
  async probe(){const s=await load();return running?{ready:true,host:foreign?'FOREIGN':plan.binding.host,instance:plan.instance,version:plan.version,
   installationId:state.installationId,sourceFingerprint:plan.sourceFingerprint,bootId:'22222222-2222-4222-8222-222222222222',activeCalls:active,
   projectInspection:{enabled:s.projectInspectEnabled===true,ready:true,revision:s.inspectionRevision??0}}:{ready:false}},
  async runtimeProcesses(s,kind){assert.equal(kind,'local');return {count:running?1:0}},async portOwner(){return running},
  async stopService(s,kind){assert.equal(kind,'local');if(failStop)throw Error('STOP_FIXTURE_FAILURE');stops++;running=false;task.state='Disabled';task.enabled=false;if(drift)task.arguments+=' --foreign'},
  async taskEnable(name){assert.equal(name,plan.tasks.local);enables++;task.enabled=true;task.state='Ready'},
  async taskStart(name){assert.equal(name,plan.tasks.local);if(failStart)throw Error('START_FIXTURE_FAILURE');starts++;running=true;task.state='Running'},
  async waitReady(){return this.probe()}
 };
 return {base,stateRoot,source:plan.sourceRoot,platform,load,state,task,get stops(){return stops},get starts(){return starts},get enables(){return enables},
  busy(v){active=v},foreign(v){foreign=v},failStop(v){failStop=v},failStart(v){failStart=v},drift(v){drift=v},
  async rewrite(update){const s=await load();Object.assign(s,update);await atomicJson(path.join(stateRoot,'install.json'),s)}};
}
const options=f=>({load:f.load});
const plan=f=>planInspection(f.source,f.stateRoot,{enabled:true},f.platform,options(f));
const apply=(f,p)=>applyInspection(f.source,f.stateRoot,p,p.approvalSha256,true,f.platform,options(f));
test('inspection CLI exposes owner list/plan/apply/rollback without new MCP writes',()=>{
 for(const action of ['list','plan','apply','rollback'])assert.equal(parseArgs(['inspection','--action',action,'--state','C:\\Fixture','--json']).args.action,action);
 assert.throws(()=>parseArgs(['inspection','--credential','secret']),/Unknown/);
});
test('enable and disable restart only local broker and persist exact revision',async()=>{
 const f=await fixture(),p=(await plan(f)).proposal;
 assert.equal(f.stops,0);assert.equal(p.next.enabled,true);assert.match(p.gitSha256,/^[0-9a-f]{64}$/);
 assert.equal((await apply(f,p)).status,'INSPECTION_UPDATED');assert.equal(f.stops,1);assert.equal(f.starts,1);
 const cfg=JSON.parse(await fs.readFile(path.join(f.stateRoot,'settings.json'),'utf8'));assert.equal(cfg.enableProjectInspect,true);assert.equal(cfg.projectInspectRevision,1);
 assert.equal((await listInspection(f.source,f.stateRoot,f.platform,options(f))).runtime.ready,true);
 const off=(await planInspection(f.source,f.stateRoot,{enabled:false},f.platform,options(f))).proposal;
 assert.equal((await apply(f,off)).enabled,false);assert.equal(f.stops,2);assert.equal(f.starts,2);assert.equal((await f.load()).inspectionRevision,2);
});
test('owner stopped remains stopped; no task enable or start',async()=>{
 const f=await fixture({stopped:true}),p=(await plan(f)).proposal;
 assert.equal((await apply(f,p)).status,'INSPECTION_UPDATED_STOPPED');assert.equal(f.stops,0);assert.equal(f.starts,0);assert.equal(f.enables,0);assert.equal((await f.load()).operatorStopped,true);
});
test('approval, strict boolean, unsupported fields and no-change reject without effects',async()=>{
 const f=await fixture(),p=(await plan(f)).proposal;
 await assert.rejects(()=>applyInspection(f.source,f.stateRoot,p,'bad',true,f.platform,options(f)),/Exact proposal/);
 await assert.rejects(()=>planInspection(f.source,f.stateRoot,{enabled:'true'},f.platform,options(f)),/boolean/);
 await assert.rejects(()=>planInspection(f.source,f.stateRoot,{enabled:true,gitExecutable:'C:\\evil.exe'},f.platform,options(f)),/unsupported fields/);
 await assert.rejects(()=>planInspection(f.source,f.stateRoot,{enabled:false},f.platform,options(f)),/already selected/);assert.equal(f.stops,0);
});
for(const key of ['rootsRevision','inspectionRevision','indexProfile'])test('stale '+key+' invalidates the approved inspection proposal',async()=>{
 const f=await fixture(),p=(await plan(f)).proposal;
 await f.rewrite({[key]:key==='indexProfile'?{changed:true}:9});
 await assert.rejects(()=>apply(f,p),/changed since approval/);assert.equal(f.stops,0);
});
for(const kind of ['active','foreign','disabled','task-drift'])test(kind+' local broker blocks before mutation',async()=>{
 const f=await fixture(),p=(await plan(f)).proposal;
 if(kind==='active')f.busy(1);if(kind==='foreign')f.foreign(true);if(kind==='disabled')f.task.enabled=false;if(kind==='task-drift')f.task.arguments+=' --changed';
 await assert.rejects(()=>apply(f,p));assert.equal(f.stops,0);assert.equal((await f.load()).pendingInspectionChange,undefined);
});
test('failure after stop preserves intent and rollback does not restart',async()=>{
 const f=await fixture(),p=(await plan(f)).proposal;f.failStart(true);
 await assert.rejects(()=>apply(f,p),/START_FIXTURE_FAILURE/);
 assert.equal((await f.load()).pendingInspectionChange.phase,'START_AUTHORIZED');
 await assert.rejects(()=>apply(f,p),/Recover the prior/);
 assert.equal((await listInspection(f.source,f.stateRoot,f.platform,options(f))).status,'INSPECTION_CHANGE_INTERRUPTED');
 const r=await rollbackInspection(f.source,f.stateRoot,true,f.platform,options(f));assert.equal(r.status,'INSPECTION_ROLLED_BACK_STOPPED');assert.equal(f.starts,0);assert.equal((await f.load()).projectInspectEnabled,false);
});
test('task drift after stop is not enabled and explicit rollback refuses drift',async()=>{
 const f=await fixture(),p=(await plan(f)).proposal;f.drift(true);
 await assert.rejects(()=>apply(f,p),/no longer matches/);assert.equal(f.enables,0);
 await assert.rejects(()=>rollbackInspection(f.source,f.stateRoot,true,f.platform,options(f)),/no longer matches/);
});
test('settings drift is not overwritten by apply or recovery',async()=>{
 const f=await fixture(),p=(await plan(f)).proposal;
 await fs.writeFile(path.join(f.stateRoot,'settings.json'),'{}');await assert.rejects(()=>apply(f,p),/settings do not match/);assert.equal(f.stops,0);
 await atomicJson(path.join(f.stateRoot,'settings.json'),await settings(await f.load()));f.failStart(true);await assert.rejects(()=>apply(f,p));
 await fs.writeFile(path.join(f.stateRoot,'settings.json'),'{}');await assert.rejects(()=>rollbackInspection(f.source,f.stateRoot,true,f.platform,options(f)),/neither approved side/);
});
