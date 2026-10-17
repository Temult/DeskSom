import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

const source=path.dirname(fileURLToPath(import.meta.url));
const version='2026-07-28';
const meta={'io.modelcontextprotocol/protocolVersion':version,
 'io.modelcontextprotocol/clientInfo':{name:'discovery-fixture',version:'1'},
 'io.modelcontextprotocol/clientCapabilities':{}};
test('isolated broker reports a full catalog and supports actual writes', {timeout:150000}, async t=>{
 const temp=await fs.mkdtemp(path.join(source,'probe-fixture-'));
 const token=randomBytes(32).toString('hex');
 const cfg={expectedHost:os.hostname(),stateDir:path.join(temp,'state'),workDir:temp,
   allowedDirectories:[temp],instance:'discovery-qa',installationId:'11111111-1111-4111-8111-111111111111',sourceFingerprint:'f'.repeat(64),port:0};
 await fs.writeFile(path.join(temp,'settings.json'),JSON.stringify(cfg));
 let readyResolve,readyReject;
 const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject});
 const child=spawn(process.execPath,[path.join(source,'broker.mjs'),'--config',path.join(temp,'settings.json'),'--port','0'],
   {cwd:source,env:{...process.env,DESKSOM_HTTP_TOKEN:token,DESKTOP_COMMANDER_DISABLE_TELEMETRY:'1'},
    stdio:['ignore','pipe','pipe']});
 let output='',stderr='',started=false; child.stdout.on('data',data=>{
  output+=data.toString();
  const ix=output.indexOf('\n');
  if(ix>=0 && !started){started=true;try{readyResolve(JSON.parse(output.slice(0,ix)))}catch(e){readyReject(e)}}
 });
 child.stderr.on('data',data=>{stderr+=data.toString().slice(0,3000)});
 child.on('exit',code=>{if(!started)readyReject(new Error('Fixture exit='+code+' '+stderr.slice(0,1000)))});
 t.after(async ()=>{
  if(child.exitCode===null){child.kill();await Promise.race([
   new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,2500))]);}
  await fs.rm(temp,{force:true,recursive:true});
 });
 const startup=await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Fixture startup timeout '+stderr)),60000))]);
 assert.match(startup.address,/^http:\/\/127\.0\.0\.1:\d+$/);
 async function invoke(method,params={},modern=true,auth=true){
  const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream'};
  if(auth)headers.Authorization='Bearer '+token;
  if(modern){headers['Mcp-Protocol-Version']=version;headers['Mcp-Method']=method;
    if(method==='tools/call')headers['Mcp-Name']=params.name;}
  const body={jsonrpc:'2.0',id:1,method,params:modern?{...params,_meta:meta}:params};
  const r=await fetch(startup.address+'/mcp',{method:'POST',headers,body:JSON.stringify(body),
    signal:AbortSignal.timeout(12000)});
  return {code:r.status,data:JSON.parse(await r.text())};
 } const unauthorized=await invoke('tools/list',{},true,false);
 assert.equal(unauthorized.code,401);
 const discovery=await invoke('server/discover');
 assert.equal(discovery.code,200);
 const listing=await invoke('tools/list');
 assert.equal(listing.code,200);
 const advertised=listing.data.result.tools;
 assert.equal(advertised.length,25);
 const names=advertised.map(t=>t.name);
 for(const name of ['desksom_status','write_file','edit_block','create_directory','start_process'])
   assert.ok(names.includes(name),'Missing '+name);
 for(const name of ['write_file','edit_block','create_directory','start_process'])
   assert.equal(advertised.find(t=>t.name===name).annotations.readOnlyHint,false,name);
 assert.ok(advertised.every(t=>!JSON.stringify(t).includes('ui://desktop-commander/')));
 assert.ok(advertised.find(t=>t.name==='write_file').description.length<250);
 const status=(await invoke('tools/call',{name:'desksom_status',arguments:{}})).data.result.structuredContent;
 assert.deepEqual(status.advertisedCapabilities.toolNames,names);
 assert.equal(status.advertisedCapabilities.clientVisibility,'NOT_OBSERVABLE_FROM_DESKSOM_SERVER');
 assert.equal(status.advertisedCapabilities.advertisesFileWrites,true);
 assert.equal(status.advertisedCapabilities.advertisesHostExecution,true);
 assert.equal(status.advertisedToolCount,25);
 assert.equal(status.instance,'discovery-qa');
 assert.equal(status.installationId,'11111111-1111-4111-8111-111111111111');
 assert.equal(status.sourceFingerprint,'f'.repeat(64));
 assert.equal(status.catalogSha256,createHash('sha256').update(JSON.stringify(advertised.slice(1))).digest('hex'));
 const probe=path.join(temp,'disposable-write.txt');
 const writing=await invoke('tools/call',{name:'write_file',arguments:{path:probe,content:'CATALOG_PROBE_1\n',mode:'rewrite'}});
 assert.equal(writing.code,200);assert.notEqual(writing.data.result.isError,true);
 assert.equal(await fs.readFile(probe,'utf8'),'CATALOG_PROBE_1\n'); const editing=await invoke('tools/call',{name:'edit_block',arguments:{
  file_path:probe,old_string:'CATALOG_PROBE_1',new_string:'CATALOG_PROBE_2',expected_replacements:1}});
 assert.equal(editing.code,200);assert.notEqual(editing.data.result.isError,true);
 assert.equal(await fs.readFile(probe,'utf8'),'CATALOG_PROBE_2\n');
 const reading=await invoke('tools/call',{name:'read_file',arguments:{path:probe}});
 assert.equal(reading.code,200);
 assert.match(JSON.stringify(reading.data.result),/CATALOG_PROBE_2/);
 const terminal=await invoke('tools/call',{name:'start_process',arguments:{
  command:'Write-Output DISCOVERY_TERMINAL_OK',shell:'pwsh.exe',timeout_ms:2000}});
 assert.equal(terminal.code,200);assert.notEqual(terminal.data.result.isError,true);
 const legacyInit=await invoke('initialize',{protocolVersion:'2025-11-25',
    capabilities:{},clientInfo:{name:'legacy-probe',version:'1'}},false);
 assert.equal(legacyInit.code,200);
 const legacyList=await invoke('tools/list',{},false);
 assert.equal(legacyList.code,200);
 assert.deepEqual(legacyList.data.result.tools.map(t=>t.name),names);
 console.log(JSON.stringify({result:'CROSS_PROTOCOL_WRITE_CAPABILITIES_PASS',
   toolCount:names.length,descriptionLength:advertised.reduce((s,t)=>s+(t.description?.length??0),0),
   capabilityStatus:true,isolated:true,productionAffected:false}));
});
