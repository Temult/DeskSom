// Tests use disposable state and a synthetic bearer, never the production token.
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {modernExchange, META_VERSION, META_CLIENT, META_CAPS} from './modern.mjs';

const pVersion='2026-07-28';
const meta={ [META_VERSION]:pVersion,[META_CLIENT]:{name:'desksom-fixture',version:'1.0'},[META_CAPS]:{} };
const headers={'mcp-protocol-version':pVersion,'mcp-method':'server/discover'};
const tools=[{name:'sample',description:'safe',inputSchema:{type:'object',properties:{}}}];
const context={tools,invokeTool:async p=>({content:[{type:'text',text:p.name}]})};
const message=(method,params={})=>({jsonrpc:'2.0',id:1,method,params:{...params,_meta:meta}});
test('modern self-contained discovery has the exact required fields',async ()=>{
  const r=await modernExchange(headers,message('server/discover'),context);
  assert.equal(r.status,200);assert.equal(r.body.result.resultType,'complete');
  assert.deepEqual(r.body.result.supportedVersions,[pVersion]);assert.ok(r.body.result._meta['io.modelcontextprotocol/serverInfo']);
});
test('modern tool listing and tool execution preserve resultType',async ()=>{
  const list=await modernExchange({...headers,'mcp-method':'tools/list'},message('tools/list'),context);
  assert.equal(list.status,200);assert.equal(list.body.result.resultType,'complete');assert.deepEqual(list.body.result.tools,tools);
  const invoke=await modernExchange({...headers,'mcp-method':'tools/call','mcp-name':'sample'},message('tools/call',{name:'sample',arguments:{}}),context);
  assert.equal(invoke.body.result.resultType,'complete');assert.equal(invoke.body.result.content[0].text,'sample');
});
test('modern protocol rejects mismatched authority and malformed JSON-RPC',async ()=>{
  const badHdr=await modernExchange({...headers,'mcp-protocol-version':'2025-11-25'},message('server/discover'),context);
  assert.equal(badHdr.status,400);
  const mismatch=await modernExchange({...headers,'mcp-method':'tools/list'},message('server/discover'),context);
  assert.equal(mismatch.status,400);
  const missingCaps=await modernExchange(headers,{...message('server/discover'),params:{_meta:{[META_VERSION]:pVersion,[META_CLIENT]:{name:'test'}}}},context);
  assert.equal(missingCaps.status,400);
  const notModern=await modernExchange({}, {jsonrpc:'2.0',method:'initialize',id:2,params:{}},context);
  assert.equal(notModern,null);
});
test('unknown modern methods and invalid argument shape fail without invoking engine',async ()=>{
  let invoked=0;
  const cx={tools,invokeTool:async ()=>{invoked++;throw Error('must not invoke')}};
  const unknown=await modernExchange({...headers,'mcp-method':'resources/read'},message('resources/read'),cx);
  assert.equal(unknown.body.error.code,-32601);
  const badArgs=await modernExchange({...headers,'mcp-method':'tools/call'},message('tools/call',{name:'sample',arguments:[]}),cx);
  assert.equal(badArgs.body.error.code,-32602);assert.equal(invoked,0);
});
test('live disposable broker accepts modern and legacy protocols', {timeout:150000},async t=>{
  const root=path.dirname(fileURLToPath(import.meta.url));
  const tmp=await fs.mkdtemp(path.join(root,'modern-fixture-'));
  let port=0;
  const localToken=randomBytes(32).toString('hex');
  const cfg={expectedHost:os.hostname(),stateDir:path.join(tmp,'private'),workDir:tmp,port,allowedDirectories:[tmp]};
  await fs.writeFile(path.join(tmp,'settings.json'),JSON.stringify(cfg));
  await fs.writeFile(path.join(tmp,'sample.txt'),'MODERN_FIXTURE_BYTES\n');
  const child=spawn(process.execPath,[path.join(root,'broker.mjs'),'--config',path.join(tmp,'settings.json'),'--port',String(port),'--status-file',path.join(tmp,'broker-ready.json')],{
    cwd:root,env:{...process.env,DESKSOM_HTTP_TOKEN:localToken,DESKTOP_COMMANDER_DISABLE_TELEMETRY:'1'},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',b=>{stdout+=b.toString().slice(0,500)});child.stderr.on('data',b=>{stderr+=b.toString().slice(0,1500)});
  t.after(async ()=>{child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,2500))]);await fs.rm(tmp,{recursive:true,force:true,maxRetries:20,retryDelay:150})});
  let ready=false;
  for(let i=0;i<600;i++){if(child.exitCode!==null)throw Error('fixture exited: '+stderr.slice(0,300));
    try{const receipt=JSON.parse(await fs.readFile(path.join(tmp,'broker-ready.json'),'utf8'));port=new URL(receipt.address).port;const r=await fetch('http://127.0.0.1:'+port+'/readyz',{signal:AbortSignal.timeout(800)});if(r.status===200){ready=true;break}}catch{}
    await new Promise(resolve=>setTimeout(resolve,150));}
  assert.equal(ready,true,'fixture failed to bind: '+stderr.slice(0,300));
  async function invoke(method,params={},modern=true,authorization=true){
    const body={jsonrpc:'2.0',id:11,method,params:modern?{...params,_meta:meta}:params};
    const h={'Content-Type':'application/json','Accept':'application/json, text/event-stream'};
    if(authorization)h.Authorization='Bearer '+localToken;
    if(modern){h['Mcp-Protocol-Version']=pVersion;h['Mcp-Method']=method;if(method==='tools/call')h['Mcp-Name']=params.name}
    const resp=await fetch('http://127.0.0.1:'+port+'/mcp',{method:'POST',headers:h,body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
    const raw=await resp.text();return {status:resp.status,json:raw?JSON.parse(raw):null};
  }
  const unauth=await invoke('server/discover',{},true,false);assert.equal(unauth.status,401);
  const disco=await invoke('server/discover');assert.equal(disco.status,200);assert.equal(disco.json.result.resultType,'complete');
  const list=await invoke('tools/list');assert.equal(list.status,200);assert.equal(list.json.result.resultType,'complete');
  assert.ok(list.json.result.tools.some(x=>x.name==='desksom_status'));assert.ok(list.json.result.tools.some(x=>x.name==='read_file'));
  assert.equal(list.json.result.tools.length,24);
  assert.ok(list.json.result.tools.every(x => !JSON.stringify(x).includes('ui://desktop-commander/')),'unserved UI URI in catalog');
  assert.ok(list.json.result.tools.every(x => !x._meta?.['openai/outputTemplate'] && !x._meta?.['ui/resourceUri'] && !x._meta?.ui),'unserved UI hint in catalog');
  const status=await invoke('tools/call',{name:'desksom_status',arguments:{}});assert.equal(status.status,200);
  assert.equal(status.json.result.resultType,'complete');assert.equal(status.json.result.structuredContent.host,os.hostname());
  const reader=await invoke('tools/call',{name:'read_file',arguments:{path:path.join(tmp,'sample.txt')}});assert.equal(reader.status,200);
  assert.match(JSON.stringify(reader.json.result.content),/MODERN_FIXTURE_BYTES/);
  const legacy=await invoke('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'legacy-test',version:'1'}},false);
  assert.equal(legacy.status,200);assert.equal(legacy.json.result.serverInfo.name,'somnerai-desksom');
  const legacyList=await invoke('tools/list',{},false);assert.equal(legacyList.status,200);assert.ok(legacyList.json.result.tools.length>=20);
  console.log(JSON.stringify({result:'MODERN_AND_LEGACY_HTTP_PASS',toolCount:list.json.result.tools.length,syntheticToken:true,disposablePath:tmp}));
});

test('2026-07-28 discovery and list supply mandatory private cache metadata',async ()=>{
  for(const [method,heads] of [['server/discover',headers],['tools/list',{...headers,'mcp-method':'tools/list'}]]) {
    const v=await modernExchange(heads,message(method),context);
    assert.equal(v.status,200);
    assert.equal(v.body.result.resultType,'complete');
    assert.equal(v.body.result.ttlMs,0);
    assert.equal(v.body.result.cacheScope,'private');
  }
});
