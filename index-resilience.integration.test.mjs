import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
const source=import.meta.dirname;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const meta={'io.modelcontextprotocol/protocolVersion':'2026-07-28',
 'io.modelcontextprotocol/clientInfo':{name:'rc14-resilience-fixture',version:'1'},
 'io.modelcontextprotocol/clientCapabilities':{}};

test('a failed optional index leaves HTTP, files, terminal, inspection and healthy-root search usable',{timeout:90000},async t=>{
 const base=fsSync.realpathSync.native(await fs.mkdtemp(path.join(os.tmpdir(),'desksom-rc14-broker-')));
 const state=path.join(base,'private');await fs.mkdir(path.join(state,'dc'),{recursive:true});
 const roots=[path.join(base,'allowed-good'),path.join(base,'allowed-bad')];
 for(const root of roots){await fs.mkdir(root);await fs.writeFile(path.join(root,'baseline.txt'),'fixture\n')}
 const indices=roots.map((root,i)=>({root,database:path.join(state,'index-'+i+'.sqlite')}));
 const badBytes=Buffer.alloc(4096,0x5a);await fs.writeFile(indices[1].database,badBytes);
 const config={expectedHost:os.hostname(),instance:'rc14-resilience-fixture',installationId:randomUUID(),
  sourceFingerprint:'f'.repeat(64),stateDir:state,workDir:base,allowedDirectories:roots,
  enableProjectInspect:true,fastFilenameIndex:{enabled:true,selfHealing:true,periodicReconcileMs:300000,indices}};
 await fs.writeFile(path.join(state,'dc','config.json'),JSON.stringify({allowedDirectories:roots,
  defaultShell:'pwsh.exe',telemetryEnabled:false,pendingWelcomeOnboarding:false,welcomeOnboardingEligible:false,
  fileReadLineLimit:500,fileWriteLineLimit:500}));
 const settings=path.join(base,'settings.json'),statusPath=path.join(base,'startup.json');
 await fs.writeFile(settings,JSON.stringify(config));
 const token=randomBytes(32).toString('hex');
 const child=spawn(process.execPath,[path.join(source,'broker.mjs'),'--config',settings,'--port','0','--status-file',statusPath],{
  cwd:source,windowsHide:true,env:{...process.env,DESKSOM_HTTP_TOKEN:token,DESKTOP_COMMANDER_DISABLE_TELEMETRY:'1'},stdio:['ignore','pipe','pipe']});
 child.stdout.resume();let stderr='',quiesced=false;
 child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-8000)});
 t.after(async()=>{
  if(child.exitCode===null)child.kill('SIGTERM');
  if(child.exitCode===null)await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(3500)]);
  if(quiesced)await fs.rm(base,{recursive:true,force:true,maxRetries:12,retryDelay:150});
  else{await fs.writeFile(path.join(base,'fixture-stderr.txt'),stderr);t.diagnostic('Preserved fixture: '+base)}
 });
 let startup;
 for(const until=Date.now()+30000;Date.now()<until;){
  if(child.exitCode!==null)throw Error('Fixture broker exited before core readiness: '+stderr);
  try{startup=JSON.parse(await fs.readFile(statusPath,'utf8'));break}catch{}
  await sleep(50);
 }
 assert.ok(startup?.address,'Core service failed to start: '+stderr);
 const call=async(name,args={})=>{
  const r=await fetch(startup.address+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,
   'Content-Type':'application/json','Accept':'application/json, text/event-stream',
   'Mcp-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':name},
   body:JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method:'tools/call',params:{name,arguments:args,_meta:meta}}),
   signal:AbortSignal.timeout(15000)});
  assert.equal(r.status,200);return (await r.json()).result;
 };
 let observed;
 for(const until=Date.now()+12000;Date.now()<until;){
  observed=(await call('desksom_status')).structuredContent;
  if(observed.indexStatus.roots.some(r=>r.ready)&&observed.indexStatus.roots.some(r=>r.state==='FAILED'))break;
  await sleep(50);
 }
 assert.equal(observed.ready,true);assert.equal(observed.indexWorkerReady,false);assert.equal(observed.allFeaturesReady,false);
 assert.equal(observed.readinessContract,'CORE_SERVICE_WITH_OPTIONAL_FEATURE_HEALTH_V1');
 assert.equal(observed.advertisedToolCount,27);
 assert.equal(observed.indexStatus.roots[0].ready,true);assert.equal(observed.indexStatus.roots[1].errorCode,'ERR_SQLITE_ERROR');
 assert.equal(JSON.stringify(observed.indexStatus).includes(state),false);
 const health=await fetch(startup.address+'/readyz');assert.equal(health.status,200);
 const publicHealth=await health.json();assert.equal(publicHealth.ready,true);assert.equal(publicHealth.indexWorkerReady,false);
 assert.equal(JSON.stringify(publicHealth).includes(roots[0]),false);
 const ordinaryRead=await call('read_file',{path:path.join(roots[1],'baseline.txt')});
 assert.notEqual(ordinaryRead.isError,true,JSON.stringify(ordinaryRead));
 const destination=path.join(roots[1],'write-during-degraded.txt');
 assert.notEqual((await call('write_file',{path:destination,content:'acknowledged once\n',mode:'rewrite'})).isError,true);
 assert.equal(await fs.readFile(destination,'utf8'),'acknowledged once\n');
 const terminal=await call('start_process',{command:'Write-Output RC14_CORE_STILL_AVAILABLE',shell:'pwsh.exe',timeout_ms:2000});
 assert.notEqual(terminal.isError,true);
 const inspection=await call('inspect_project',{path:roots[1]});assert.notEqual(inspection.isError,true);
 assert.equal(inspection.structuredContent.execution.projectScriptsRun,false);
 const found=await call('find_files_fast',{root:roots[0],query:'baseline'});
 assert.notEqual(found.isError,true);assert.equal(found.structuredContent.results.length,1);
 const unavailable=await call('find_files_fast',{root:roots[1],query:'baseline'});
 assert.equal(unavailable.isError,true);assert.equal(unavailable.structuredContent.absenceAuthoritative,false);
 assert.deepEqual(await fs.readFile(indices[1].database),badBytes);
 const response=await fetch(startup.address+'/index-quiesce',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({bootId:observed.bootId,installationId:config.installationId}),signal:AbortSignal.timeout(15000)});
 const ack=await response.json();assert.equal(response.status,200,JSON.stringify(ack));assert.equal(ack.status,'INDEX_QUIESCED');
 assert.equal(ack.writerLeaseReleased,true);
 for(const i of indices)assert.equal(await fs.stat(i.database+'.writer-lock').then(()=>true,()=>false),false);
 assert.equal((await fetch(startup.address+'/readyz')).status,503);
 assert.equal((await call('read_file',{path:path.join(roots[0],'baseline.txt')})).isError,true);
 quiesced=true;
 console.log(JSON.stringify({result:'RC14_DEGRADED_INDEX_BROKER_PASS',coreReady:true,indexReady:false,toolCount:27,
  ordinaryRead:true,ordinaryWrite:true,terminal:true,inspection:true,healthyRootSearch:true,
  failedRootRefused:true,corruptEvidencePreserved:true,explicitQuiesceVerified:true}));
});
