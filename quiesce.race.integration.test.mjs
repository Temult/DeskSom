import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const source=path.dirname(fileURLToPath(import.meta.url));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('real authenticated quiesce rejects an in-flight tool admitted while body was incomplete', {timeout:180000}, async()=>{
 const fixture=await fs.mkdtemp(path.join(source,'quiesce-fixture-'));
 const root=path.join(fixture,'allowed'),state=path.join(fixture,'private'),db=path.join(state,'index.sqlite');
 await fs.mkdir(root);await fs.mkdir(state);await fs.writeFile(path.join(root,'baseline.txt'),'fixture');
 const id=randomUUID(),token=randomBytes(32).toString('hex');
 const cfg={expectedHost:os.hostname(),instance:'quiesce-race-fixture',installationId:id,
   sourceFingerprint:'q'.repeat(64),stateDir:state,workDir:fixture,allowedDirectories:[root],
   fastFilenameIndex:{enabled:true,selfHealing:true,periodicReconcileMs:300000,indices:[{root,database:db}]}};
 const conf=path.join(fixture,'config.json'),statusFile=path.join(fixture,'ready.json');
 await fs.writeFile(conf,JSON.stringify(cfg));
 const proc=spawn(process.execPath,[path.join(source,'broker.mjs'),'--config',conf,'--port','0','--status-file',statusFile],
   {cwd:source,env:{...process.env,DESKSOM_HTTP_TOKEN:token,DESKTOP_COMMANDER_DISABLE_TELEMETRY:'1'},stdio:['ignore','pipe','pipe']});
 let stderr='';proc.stderr.on('data',d=>{stderr=(stderr+d.toString()).slice(-1800)});
 let socket;
 try{
  let startup;
  const deadline=Date.now()+115000;
  while(Date.now()<deadline){
   if(proc.exitCode!==null)throw Error('Broker exited before readiness: '+stderr.slice(0,450));
   try{startup=JSON.parse(await fs.readFile(statusFile,'utf8'));break}catch{}
   await sleep(100);
  }
  assert.ok(startup?.address,'Bounded broker startup failed: '+stderr.slice(0,450));
  const port=Number(new URL(startup.address).port),bootId=startup.bootId;
  const meta={'io.modelcontextprotocol/protocolVersion':'2026-07-28',
    'io.modelcontextprotocol/clientInfo':{name:'quiesce-race-fixture',version:'1'},
    'io.modelcontextprotocol/clientCapabilities':{}};
  const rpc=async (method,params={},timeoutMs=15000)=>{
   const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream',
     'Mcp-Protocol-Version':'2026-07-28','Mcp-Method':method,Authorization:'Bearer '+token};
   if(method==='tools/call')headers['Mcp-Name']=params.name;
   const body={jsonrpc:'2.0',id:Math.floor(Math.random()*1e8),method,params:{...params,_meta:meta}};
   const response=await fetch(startup.address+'/mcp',{method:'POST',headers,body:JSON.stringify(body),
     signal:AbortSignal.timeout(timeoutMs)});
   return {status:response.status,body:await response.json()};
  };
  const procStart=await rpc('tools/call',{name:'start_process',
    arguments:{command:'pwsh.exe -NoProfile -NonInteractive -Command Start-Sleep -Seconds 9',
      timeout_ms:20000,shell:'powershell'}});
  assert.equal(procStart.status,200);
  const match=JSON.stringify(procStart.body.result??{}).match(/PID\s+(\d+)/i);
  assert.ok(match,'Synthetic process did not return a PID');
  const processPid=Number(match[1]);
  const payload=JSON.stringify({installationId:id,bootId});
  socket=net.createConnection({host:'127.0.0.1',port});
  const responseParts=[];socket.on('data',chunk=>responseParts.push(chunk));
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject)});
  socket.write('POST /index-quiesce HTTP/1.1\r\nHost: 127.0.0.1:'+port+'\r\nAuthorization: Bearer '+token+
    '\r\nContent-Type: application/json\r\nContent-Length: '+Buffer.byteLength(payload)+
    '\r\nConnection: close\r\n\r\n'+payload.slice(0,1));
  await sleep(200);
  let pendingFinishedAt=null;
  const pending=rpc('tools/call',{name:'read_process_output',
    arguments:{pid:processPid,timeout_ms:6500,offset:0,length:1000}},12000)
    .then(x=>{pendingFinishedAt=Date.now();return x});
  let observedActive=0;const waitStart=Date.now();
  while(Date.now()-waitStart<5000){
   const observation=await rpc('tools/call',{name:'desksom_status',arguments:{}},5000);
   observedActive=observation.body?.result?.structuredContent?.activeCalls??0;
   if(observedActive>0)break;
   await sleep(40);
  }
  assert.ok(observedActive>0,'Never observed an active MCP request during the race');
  socket.write(payload.slice(1));
  await Promise.race([
   new Promise((resolve,reject)=>{socket.once('end',resolve);socket.once('error',reject)}),
   sleep(8000).then(()=>{throw Error('Quiesce response timeout')})
  ]);
  const response=Buffer.concat(responseParts).toString('utf8');
  const status=Number(response.match(/^HTTP\/1\.1\s+(\d+)/)?.[1]??0);
  assert.equal(status,409,'Quiesce must refuse an active tool after fully parsing the body');
  assert.match(response,/index_not_quiet/);
  assert.equal(pendingFinishedAt,null,'Race must be observed before tool completion');
  assert.equal((await pending).status,200);
  // The refused quiesce must not have stopped or detached the writer.
  assert.ok(await fs.stat(db+'.writer-lock').then(()=>true,()=>false));
  await sleep(2700);
  const approved=await fetch(startup.address+'/index-quiesce',{
   method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:payload,signal:AbortSignal.timeout(15000)});
  const ack=await approved.json();
  assert.equal(approved.status,200,'Clean quiesce after all active calls finish must succeed');
  assert.equal(ack.status,'INDEX_QUIESCED');
  assert.equal(ack.bootId,bootId);
  assert.equal(await fs.stat(db+'.writer-lock').then(()=>true,()=>false),false,'Graceful stop releases lease');
  const after=await rpc('tools/call',{name:'read_file',arguments:{path:path.join(root,'baseline.txt')}});
  assert.equal(after.body.result.isError,true,'No new work admitted after quiescence');
  console.log(JSON.stringify({status:'QUIESCE_R10_RACE_PASS',activeObserved:observedActive,
    inFlightRefused:true,pendingCompleted:true,subsequentQuiesceSucceeded:true,leaseReleased:true,
    postQuiesceAdmissionDenied:true,fixtureOnly:true}));
 }finally{
  socket?.destroy();
  proc.kill('SIGTERM');
  await Promise.race([new Promise(resolve=>proc.once('exit',resolve)),sleep(2500)]);
  // Never delete a fixture whose writer lease was left after a crash. Preserve
  // the evidence instead of making the worker lock disappear artificially.
  const lock=await fs.readdir(state).then(x=>x.some(n=>n.endsWith('.writer-lock')),()=>true);
  if(!lock)await fs.rm(fixture,{recursive:true,force:true,maxRetries:15,retryDelay:150});
 }
});
