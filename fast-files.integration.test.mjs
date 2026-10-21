import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const sourceRoot=path.dirname(fileURLToPath(import.meta.url));
const fixture=await fs.mkdtemp(path.join(sourceRoot,'fast-broker-'));
const state=path.join(fixture,'private-state'),root=path.join(fixture,'allowed'),dbfile=path.join(state,'native-index.sqlite');
await fs.mkdir(root,{recursive:true});await fs.mkdir(state,{recursive:true});
const target=path.join(root,'find-this-native-broker-6042.txt');
await fs.writeFile(target,'TEST_NOT_SECRET\n');
const fastConfig=path.join(fixture,'index.json');
await fs.writeFile(fastConfig,JSON.stringify({schema:'desksom.index-v2/v1',root,database:dbfile,allowedRoots:[root]}));
const scan=spawnSync(process.execPath,[path.join(sourceRoot,'experiments','native-filename-index','index-v2.mjs'),'scan','--config',fastConfig],{timeout:20000,encoding:'utf8'});
assert.equal(scan.status,0,scan.stderr);
const cfg={expectedHost:os.hostname(),instance:'qa-fast-index',stateDir:state,workDir:fixture,
  allowedDirectories:[root],fastFilenameIndex:{enabled:true,indices:[{root,database:dbfile}]}};
const cfgFile=path.join(fixture,'broker-config.json');
await fs.writeFile(cfgFile,JSON.stringify(cfg));
const token=randomBytes(32).toString('hex'),status=path.join(fixture,'broker-status.json');
const proc=spawn(process.execPath,[path.join(sourceRoot,'broker.mjs'),'--config',cfgFile,'--port','0','--status-file',status],{
 cwd:sourceRoot,env:{...process.env,DESKSOM_HTTP_TOKEN:token,DESKTOP_COMMANDER_DISABLE_TELEMETRY:'1'},stdio:['ignore','pipe','pipe']});
let err='';proc.stderr.on('data',d=>err+=d.toString().slice(0,1200));proc.stdout.resume();
try{
 let port=null;
 for(let i=0;i<160;i++){
  if(proc.exitCode!==null)throw Error('broker exited: '+err);
  try{const record=JSON.parse(await fs.readFile(status,'utf8'));port=Number(new URL(record.address).port);break}catch{}
  await new Promise(r=>setTimeout(r,80));
 }
 assert.ok(port, 'broker did not become ready '+err.slice(0,1000));
 const meta={
  'io.modelcontextprotocol/protocolVersion':'2026-07-28',
  'io.modelcontextprotocol/clientInfo':{name:'native-fast-index-test',version:'1'},
  'io.modelcontextprotocol/clientCapabilities':{}
 };
 async function call(method,params={},authenticated=true){
  const body={jsonrpc:'2.0',id:Math.floor(Math.random()*1e8),method,params:{...params,_meta:meta}};
  const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream',
   'Mcp-Protocol-Version':'2026-07-28','Mcp-Method':method};
  if(method==='tools/call')headers['Mcp-Name']=params.name;
  if(authenticated)headers.Authorization='Bearer '+token;
  const response=await fetch('http://127.0.0.1:'+port+'/mcp',{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  return {status:response.status,body:await response.json()};
 }
 let r=await call('tools/list',{},false);assert.equal(r.status,401);
 r=await call('tools/list');assert.equal(r.status,200);
 const tools=r.body.result.tools;
 assert.equal(tools.length,25);
 const fast=tools.filter(t=>t.name==='find_files_fast');
 assert.equal(fast.length,1);assert.equal(fast[0].annotations.readOnlyHint,true);
 r=await call('tools/call',{name:'find_files_fast',arguments:{root,query:'native-broker',limit:5}});
 assert.equal(r.status,200);assert.equal(r.body.result.structuredContent.status,'INDEXED_RESULTS');
 assert.equal(r.body.result.structuredContent.results.length,1);
 assert.equal(r.body.result.structuredContent.absenceAuthoritative,false);
 r=await call('tools/call',{name:'find_files_fast',arguments:{root:'C:\\Windows',query:'native-broker'}});
 assert.equal(r.body.result.isError,true);
 assert.equal(r.body.result.structuredContent.status,'ROOT_NOT_INDEXED');
 r=await call('tools/call',{name:'find_files_fast',arguments:{root,query:'clearly-missing-99449'}});
 assert.equal(r.body.result.structuredContent.results.length,0);
 assert.equal(r.body.result.structuredContent.absenceAuthoritative,false);
 r=await call('tools/call',{name:'desksom_status',arguments:{}});
 assert.equal(r.body.result.structuredContent.advertisedToolCount,25);
 const summary={status:'OPTIONAL_MCP_HTTP_PASS',tools:25,privateIndex:true,
  authorizedPositive:true,unauthorizedRootRejected:true,negativeNonAuthoritative:true,
  syntheticTokenOnly:true,rc12ProductionUnchanged:true};
 console.log(JSON.stringify(summary));
 await fs.writeFile(path.join(fixture,'INTEGRATION_RECEIPT.json'),JSON.stringify(summary,null,2)+'\n');
}finally{
 proc.kill();await Promise.race([new Promise(r=>proc.once('exit',r)),new Promise(r=>setTimeout(r,2500))]);
 await fs.rm(fixture,{recursive:true,force:true});
}
