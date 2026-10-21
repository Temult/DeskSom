import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('enabled broker refuses shutdown success when its fixture writer lease cannot be released',{timeout:150000},async()=>{
 const source=import.meta.dirname,base=await fs.mkdtemp(path.join(source,'retained-lease-fixture-'));
 const root=path.join(base,'allowed'),state=path.join(base,'private'),database=path.join(state,'index.sqlite');
 await fs.mkdir(root);await fs.mkdir(state);await fs.writeFile(path.join(root,'baseline.txt'),'fixture');
 const installationId=randomUUID(),token=randomBytes(32).toString('hex');
 const cfg={expectedHost:os.hostname(),instance:'r12-retained-lease-fixture',installationId,
  sourceFingerprint:'r12-synthetic-only',stateDir:state,workDir:base,allowedDirectories:[root],
  fastFilenameIndex:{enabled:true,selfHealing:true,periodicReconcileMs:300000,indices:[{root,database}]}};
 const config=path.join(base,'config.json'),statusFile=path.join(base,'startup.json');
 await fs.writeFile(config,JSON.stringify(cfg));
 const child=spawn(process.execPath,[path.join(source,'broker.mjs'),'--config',config,'--port','0','--status-file',statusFile],{
  cwd:source,windowsHide:true,env:{...process.env,DESKSOM_HTTP_TOKEN:token,DESKTOP_COMMANDER_DISABLE_TELEMETRY:'1'},stdio:['ignore','pipe','pipe']});
 child.stdout.resume();let stderr='';child.stderr.on('data',bytes=>{stderr=(stderr+bytes.toString()).slice(-600)});
 const report={scope:'synthetic broker and owned retained-lock fixture only',at:new Date().toISOString(),base};
 try{
  let startup;const deadline=Date.now()+115000;
  while(Date.now()<deadline){
   if(child.exitCode!==null)throw Error('Synthetic broker exited: '+stderr);
   try{startup=JSON.parse(await fs.readFile(statusFile,'utf8'));break}catch{}
   await sleep(100);
  }
  assert.ok(startup?.address,'Synthetic broker readiness timed out');
  const lock=database+'.writer-lock';
  for(const deadline=Date.now()+10000;Date.now()<deadline;){
   if(await fs.stat(path.join(lock,'owner.json')).then(()=>true,()=>false))break;
   await sleep(20);
  }
  await fs.stat(path.join(lock,'owner.json'));
  // acquireIndexWriterLock deliberately refuses to remove unexpected children.
  // This changes only this test's lock directory, never an installed index.
  await fs.writeFile(path.join(lock,'retained-fixture.txt'),'review proof; keep this fixture',{flag:'wx'});
  const response=await fetch(startup.address+'/index-quiesce',{
   method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({installationId,bootId:startup.bootId}),signal:AbortSignal.timeout(12000)});
  const ack=await response.json();
  assert.equal(response.status,409);assert.equal(ack.error,'worker_shutdown_unconfirmed');
  assert.notEqual(ack.writerLeaseReleased,true);
  assert.equal((await fs.stat(lock)).isDirectory(),true);
  assert.equal((await fetch(startup.address+'/readyz')).status,503);
  const meta={'io.modelcontextprotocol/protocolVersion':'2026-07-28',
   'io.modelcontextprotocol/clientInfo':{name:'r12-retained-lease-test',version:'1'},'io.modelcontextprotocol/clientCapabilities':{}};
  const denied=await fetch(startup.address+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,
   'Content-Type':'application/json','Accept':'application/json, text/event-stream','Mcp-Protocol-Version':'2026-07-28',
   'Mcp-Method':'tools/call','Mcp-Name':'read_file'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',
    params:{name:'read_file',arguments:{path:path.join(root,'baseline.txt')},_meta:meta}}),signal:AbortSignal.timeout(12000)});
  assert.equal((await denied.json()).result.isError,true);
  Object.assign(report,{pass:true,httpStatus:response.status,ack:ack.error,leaseRetained:true,
   falseLeaseReleaseClaim:false,admissionStayedClosed:true});
 }catch(error){Object.assign(report,{pass:false,error:error.message});throw error}
 finally{
  // Only the child created by this test is terminated. Retain its locked fixture.
  if(child.exitCode===null)child.kill('SIGTERM');
  await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(2500)]);
  await fs.writeFile(path.join(base,'RETAINED_LEASE_RESULT.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(report));
 }
});
