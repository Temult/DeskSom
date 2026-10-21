import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import fsSync from 'node:fs';import os from 'node:os';import path from 'node:path';
import {spawn} from 'node:child_process';import {randomBytes,randomUUID} from 'node:crypto';
import {settings,taskDefinition} from './scripts/lib/install-core.mjs';
import {hashObject,atomicJson} from './scripts/lib/common.mjs';
import {makeIndexFeatureProfile} from './scripts/lib/index-profile.mjs';
import {planInspection,applyInspection} from './scripts/lib/inspection-control.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const alive=child=>!!child&&child.exitCode===null&&child.signalCode===null;
const meta={'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'inspection-owner-fixture',version:'1'},'io.modelcontextprotocol/clientCapabilities':{}};
async function fixture(indexed=false){
 const source=import.meta.dirname,base=fsSync.realpathSync.native(await fs.mkdtemp(path.join(os.tmpdir(),'desksom-owner-cycle-'))),stateRoot=path.join(base,'private'),allowed=path.join(base,'allowed');
 await fs.mkdir(path.join(stateRoot,'dc'),{recursive:true});await fs.mkdir(path.join(stateRoot,'indices'));await fs.mkdir(allowed);await fs.writeFile(path.join(allowed,'README.md'),'fixture\n');
 const body={schemaVersion:'desksom.plan/v1',instance:'owner-test',sourceRoot:source,installRoot:path.join(base,'install'),stateRoot,port:19977,
  version:'0.2.0-rc.14',sourceFingerprint:'f'.repeat(64),allowedDirectories:[allowed],tasks:{local:'DeskSom-owner-test-Local',tunnel:'DeskSom-owner-test-Tunnel'},
  binding:{host:os.hostname(),sid:'fixture-only',architecture:'x64'},permissions:{},downloads:{},externalRequirements:[]};
 const plan={...body,planSha256:hashObject(body)},s={schemaVersion:'desksom.install/v1',installationId:randomUUID(),plan,planSha256:plan.planSha256,
  environment:{wscript:'C:\\Windows\\System32\\wscript.exe'},completed:{local_task:{}},operatorStopped:false,credentialsConfigured:false,phase:'LOCAL_READY',rootsRevision:0};
 if(indexed)s.indexProfile=makeIndexFeatureProfile(s,{enabled:true,roots:[allowed],periodicMinutes:5});
 await atomicJson(path.join(stateRoot,'install.json'),s);await atomicJson(path.join(stateRoot,'settings.json'),await settings(s));
 await atomicJson(path.join(stateRoot,'dc','config.json'),{allowedDirectories:[allowed],defaultShell:'pwsh.exe',telemetryEnabled:false,pendingWelcomeOnboarding:false,welcomeOnboardingEligible:false});
 const token=randomBytes(32).toString('hex'),task={...taskDefinition(plan,s,'local'),enabled:true,state:'Ready'};
 let child=null,startup=null,stderr='',starts=0,stops=0;
 const load=async()=>JSON.parse(await fs.readFile(path.join(stateRoot,'install.json'),'utf8'));
 async function rpc(method,params={}){const response=await fetch(startup.address+'/mcp',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream',Authorization:'Bearer '+token,'Mcp-Protocol-Version':'2026-07-28','Mcp-Method':method,...(method==='tools/call'?{'Mcp-Name':params.name}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{...params,_meta:meta}}),signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);return (await response.json()).result}
 const status=async()=>startup&&alive(child)?(await rpc('tools/call',{name:'desksom_status',arguments:{}})).structuredContent:{ready:false};
 async function start(){
  assert.ok(!alive(child));startup=null;stderr='';const statusFile=path.join(stateRoot,'startup-'+randomUUID()+'.json');
  child=spawn(process.execPath,[path.join(source,'broker.mjs'),'--config',path.join(stateRoot,'settings.json'),'--port','0','--status-file',statusFile],{cwd:source,windowsHide:true,env:{...process.env,DESKSOM_HTTP_TOKEN:token,DESKTOP_COMMANDER_DISABLE_TELEMETRY:'1'},stdio:['ignore','pipe','pipe']});
  child.stdout.resume();child.stderr.on('data',b=>{stderr=(stderr+b).slice(-1600)});
  const until=Date.now()+30000;while(Date.now()<until){if(!alive(child))throw Error('Fixture broker exited '+stderr);try{startup=JSON.parse(await fs.readFile(statusFile,'utf8'));break}catch{}await sleep(50)}
  assert.ok(startup?.address,'Fixture startup timeout '+stderr);starts++;task.state='Running';return status();
 }
 async function stop(){
  if(!alive(child))return;
  const v=await status(),r=await fetch(startup.address+'/index-quiesce',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({installationId:s.installationId,bootId:v.bootId}),signal:AbortSignal.timeout(15000)});
  assert.equal(r.status,200,JSON.stringify(await r.json()));
  const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await Promise.race([exited,sleep(3000)]);assert.equal(alive(child),false);stops++;task.state='Disabled';task.enabled=false;
 }
 const platform={async lock(){return {release:async()=>{}}},async taskGet(name){assert.equal(name,plan.tasks.local);return task},probe:status,
  async runtimeProcesses(state,kind){assert.equal(kind,'local');return {count:alive(child)?1:0}},async portOwner(){return alive(child)},
  async stopService(state,kind){assert.equal(kind,'local');await stop()},async taskEnable(){task.enabled=true;task.state='Ready'},async taskStart(){await start()},async waitReady(){return status()}};
 return {base,source,stateRoot,allowed,s,load,platform,start,stop,status,rpc,async clean(){await stop();await fs.rm(base,{recursive:true,force:true,maxRetries:5,retryDelay:100})},get starts(){return starts},get stops(){return stops}};
}
for(const indexed of [false,true])test('owner workflow changes the real broker catalog and preserves indexing='+indexed,{timeout:90000,skip:indexed&&Number(process.versions.node.split('.')[0])<25},async()=>{
 const f=await fixture(indexed);try{
  const before=await f.start();assert.equal(before.advertisedToolCount,25+Number(indexed));
  const p=(await planInspection(f.source,f.stateRoot,{enabled:true},f.platform,{load:f.load})).proposal;
  await applyInspection(f.source,f.stateRoot,p,p.approvalSha256,true,f.platform,{load:f.load});
  const after=await f.status();assert.notEqual(after.bootId,before.bootId);assert.equal(after.advertisedToolCount,26+Number(indexed));assert.equal(after.projectInspection.revision,1);
  const inspection=await f.rpc('tools/call',{name:'inspect_project',arguments:{path:f.allowed}});assert.notEqual(inspection.isError,true);
  assert.equal(inspection.structuredContent.execution.projectScriptsRun,false);
  const off=(await planInspection(f.source,f.stateRoot,{enabled:false},f.platform,{load:f.load})).proposal;
  await applyInspection(f.source,f.stateRoot,off,off.approvalSha256,true,f.platform,{load:f.load});
  assert.equal((await f.status()).advertisedToolCount,25+Number(indexed));assert.equal((await f.load()).indexProfile?.enabled===true,indexed);
  assert.equal(f.starts,3);assert.equal(f.stops,2);
 }finally{await f.clean()}
});
test('missing optional Git does not disable core file access or report full readiness',{timeout:60000},async()=>{
 const f=await fixture();try{
  const cfg=await settings({...f.s,projectInspectEnabled:true,projectInspectGitExecutable:path.join(f.base,'missing','git.exe')});
  await atomicJson(path.join(f.stateRoot,'settings.json'),cfg);const status=await f.start();
  assert.equal(status.ready,true);assert.equal(status.allFeaturesReady,false);assert.equal(status.projectInspection.ready,false);assert.equal(status.advertisedToolCount,26);
  assert.notEqual((await f.rpc('tools/call',{name:'read_file',arguments:{path:path.join(f.allowed,'README.md')}})).isError,true);
  const denied=await f.rpc('tools/call',{name:'inspect_project',arguments:{path:f.allowed}});assert.equal(denied.isError,true);assert.match(JSON.stringify(denied),/GIT_EXECUTABLE_UNAVAILABLE/);
 }finally{await f.clean()}
});

test('a missing configured root leaves the real broker and remaining indexed root available',{timeout:60000,skip:Number(process.versions.node.split('.')[0])<25},async()=>{
 const f=await fixture(true);try{
  const cfg=await settings(f.s),missing=path.join(f.base,'missing-approved-folder');cfg.allowedDirectories.push(missing);
  cfg.fastFilenameIndex.indices.push({root:missing,database:path.join(f.stateRoot,'indices','missing.sqlite')});
  await atomicJson(path.join(f.stateRoot,'settings.json'),cfg);
  const first=await f.start();assert.equal(first.ready,true);assert.equal(first.indexWorkerReady,false);
  let observed=first;for(let i=0;i<100&&!observed.indexStatus.roots[0].ready;i++){await sleep(40);observed=await f.status()}
  assert.equal(observed.indexStatus.roots[0].ready,true);assert.equal(observed.indexStatus.roots[1].state,'UNAVAILABLE');
  const found=await f.rpc('tools/call',{name:'find_files_fast',arguments:{root:f.allowed,query:'README'}});assert.equal(found.structuredContent.results.length,1);
  const missingResult=await f.rpc('tools/call',{name:'find_files_fast',arguments:{root:missing,query:'anything'}});assert.equal(missingResult.structuredContent.status,'ROOT_UNAVAILABLE');
  assert.notEqual((await f.rpc('tools/call',{name:'read_file',arguments:{path:path.join(f.allowed,'README.md')}})).isError,true);
 }finally{await f.clean()}
});
