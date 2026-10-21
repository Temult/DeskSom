import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
const source=path.dirname(fileURLToPath(import.meta.url));
const exec=promisify(execFile);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const meta={'io.modelcontextprotocol/protocolVersion':'2026-07-28',
 'io.modelcontextprotocol/clientInfo':{name:'unified-fixture',version:'1'},
 'io.modelcontextprotocol/clientCapabilities':{}};
const sha=s=>createHash('sha256').update(JSON.stringify(s)).digest('hex');
test('one broker and engine: exact 25/26/26/27 catalogs, shared live operations and private roots',{timeout:240000},async t=>{
 const base=fsSync.realpathSync.native(await fs.mkdtemp(path.join(os.tmpdir(),'desksom-unified-')));
 const repo=path.join(base,'repo'),other=path.join(base,'unselected'),outside=path.join(base,'outside');
 await fs.mkdir(repo);await fs.mkdir(other);await fs.mkdir(outside);
 await exec('git',['-C',repo,'init','-q'],{timeout:10000,windowsHide:true});
 await fs.writeFile(path.join(repo,'README.md'),'fixture\n');
 await fs.writeFile(path.join(repo,'tiny.ts'),'export const n=1;\n');
 await exec('git',['-C',repo,'add','README.md','tiny.ts'],{timeout:10000,windowsHide:true});
 await exec('git',['-C',repo,'-c','user.email=fixture@example.invalid','-c','user.name=Fixture','commit','-m','fixture','-q'],{timeout:10000,windowsHide:true});
 const children=[];
 t.after(async()=>{
  for(const item of children){if(item.child.exitCode===null)item.child.kill('SIGTERM')}
  await Promise.all(children.map(async item=>{
    if(item.child.exitCode===null)await Promise.race([new Promise(resolve=>item.child.once('exit',resolve)),sleep(3500)]);
  }));
  // Preserve crashed-writer evidence; leave unclean fixture if any lease remains.
  let locks=false;
  for(const item of children){
    if(item.db&&await fs.stat(item.db+'.writer-lock').then(()=>true,()=>false))locks=true;
  }
  if(!locks)await fs.rm(base,{recursive:true,force:true,maxRetries:10,retryDelay:150});
 });
 const matrix=[],latency={inspectMs:[],indexMs:[]};
 async function start(indexed,inspection){
  const id='fixture-'+Number(indexed)+Number(inspection),privateRoot=path.join(base,id);
  const indexRoot=path.join(privateRoot,'indices');await fs.mkdir(indexRoot,{recursive:true});
  const db=path.join(indexRoot,'index.sqlite');
  const config={expectedHost:os.hostname(),instance:id,installationId:randomUUID(),
    sourceFingerprint:'c'.repeat(64),stateDir:privateRoot,workDir:base,
    allowedDirectories:[repo,other],enableProjectInspect:inspection,
    ...(indexed?{fastFilenameIndex:{enabled:true,selfHealing:true,
      periodicReconcileMs:300000,indices:[{root:repo,database:db}]}}:{})};
  const cfg=path.join(privateRoot,'settings.json'),statusPath=path.join(privateRoot,'ready.json');
  await fs.writeFile(cfg,JSON.stringify(config));
  const token=randomBytes(32).toString('hex');
  const child=spawn(process.execPath,[path.join(source,'broker.mjs'),'--config',cfg,'--port','0','--status-file',statusPath],
    {cwd:source,windowsHide:true,env:{...process.env,DESKSOM_HTTP_TOKEN:token,
     DESKTOP_COMMANDER_DISABLE_TELEMETRY:'1'},stdio:['ignore','pipe','pipe']});
  child.stdout.resume();let stderr='';
  child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-1200)});
  const item={child,db,indexed,inspection,token};children.push(item);
  let startup;
  for(const deadline=Date.now()+115000;Date.now()<deadline;){
    if(child.exitCode!==null)throw Error('BROKER_EXIT '+stderr);
    try{startup=JSON.parse(await fs.readFile(statusPath,'utf8'));break}catch{}
    await sleep(100);
  }
  assert.ok(startup?.address,'BROKER_STARTUP_TIMEOUT '+stderr);
  item.address=startup.address;item.bootId=startup.bootId;item.config=config;
  item.call=async(method,params={},authorized=true)=>{
    const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream',
      'Mcp-Protocol-Version':'2026-07-28','Mcp-Method':method};
    if(authorized)headers.Authorization='Bearer '+token;
    if(method==='tools/call')headers['Mcp-Name']=params.name;
    const body={jsonrpc:'2.0',id:Math.floor(Math.random()*1e9),method,params:{...params,_meta:meta}};
    const res=await fetch(item.address+'/mcp',{method:'POST',headers,body:JSON.stringify(body),
      signal:AbortSignal.timeout(30000)});
    return {code:res.status,body:await res.json()};
  };
  if(indexed){
   let indexReady=false;
   for(const deadline=Date.now()+30000;Date.now()<deadline;){
    const status=(await item.call('tools/call',{name:'desksom_status',arguments:{}})).body.result.structuredContent;
    if(status.indexWorkerReady===true){indexReady=true;break}
    await sleep(50);
   }
   assert.equal(indexReady,true,'The selected fixture index did not become ready');
  }
  return item;
 }
 for(const [idx,ins] of [[false,false],[true,false],[false,true],[true,true]]){
  const b=await start(idx,ins),tools=(await b.call('tools/list')).body.result.tools;
  const names=tools.map(t=>t.name),want=25+Number(idx)+Number(ins);
  assert.equal(names.length,want);assert.equal(new Set(names).size,want);
  assert.equal(names.includes('find_files_fast'),idx);
  assert.equal(names.includes('inspect_project'),ins);
  assert.equal((await b.call('tools/list',{},false)).code,401);
  const id=(await b.call('tools/call',{name:'desksom_status',arguments:{}})).body.result.structuredContent;
  assert.equal(id.advertisedToolCount,want);assert.equal(id.enginePid>0,true);
  const hash=id.catalogSha256;assert.match(hash,/^[0-9a-f]{64}$/);
  const normal=await b.call('tools/call',{name:'read_file',arguments:{path:path.join(repo,'README.md')}});
  assert.notEqual(normal.body.result?.isError,true);
  if(!ins){
    const excluded=await b.call('tools/call',{name:'inspect_project',arguments:{path:repo}});
    assert.equal(excluded.body.result?.isError,true);
  }else{
    const descriptor=tools.find(x=>x.name==='inspect_project');
    assert.equal(descriptor.annotations.readOnlyHint,true);
    assert.deepEqual(descriptor.inputSchema.required,['path']);
    const ts=performance.now();
    const observed=await b.call('tools/call',{name:'inspect_project',arguments:{path:repo}});
    latency.inspectMs.push(performance.now()-ts);
    assert.notEqual(observed.body.result?.isError,true,JSON.stringify(observed.body.result));
    const snap=observed.body.result.structuredContent;
    assert.equal(snap.mode,'READ_ONLY_ADVISORY');
    assert.equal(snap.git.detected,true);
    assert.equal(snap.execution.projectScriptsRun,false);
    assert.equal(snap.completeness.notProofOfNoOtherFiles,true);
    assert.ok(Buffer.byteLength(JSON.stringify(snap))<=12288);
    const denied=await b.call('tools/call',{name:'inspect_project',arguments:{path:outside}});
    assert.equal(denied.body.result?.isError,true);
  }
  if(!idx){
    const excluded=await b.call('tools/call',{name:'find_files_fast',arguments:{root:repo,query:'README'}});
    assert.equal(excluded.body.result?.isError,true);
  }else{
    const descriptor=tools.find(x=>x.name==='find_files_fast');
    assert.equal(descriptor.annotations.readOnlyHint,true);
    const ts=performance.now();
    const found=await b.call('tools/call',{name:'find_files_fast',arguments:{root:repo,query:'README',limit:10}});
    latency.indexMs.push(performance.now()-ts);
    assert.notEqual(found.body.result?.isError,true,JSON.stringify(found.body.result));
    assert.ok(found.body.result.structuredContent.results.some(f=>f.name==='README.md'));
    const wrong=await b.call('tools/call',{name:'find_files_fast',arguments:{root:other,query:'README'}});
    assert.equal(wrong.body.result?.isError,true);
    if(ins){
      const fname='unified-new-'+randomUUID().slice(0,8)+'.txt';
      const write=await b.call('tools/call',{name:'write_file',arguments:{
        path:path.join(repo,fname),content:'unified disposable\n',mode:'rewrite'}});
      assert.notEqual(write.body.result?.isError,true);
      let seen=false;
      for(let i=0;i<6;i++){
       const r=await b.call('tools/call',{name:'find_files_fast',arguments:{root:repo,query:fname}});
       seen=!!r.body.result?.structuredContent?.results?.some(x=>x.name===fname);
       if(seen)break;await sleep(180);
      }
      assert.equal(seen,true,'Write-through indexed lookup did not find new file');
      const observation=await b.call('tools/call',{name:'inspect_project',arguments:{path:repo}});
      assert.notEqual(observation.body.result?.isError,true);
      assert.equal(observation.body.result.structuredContent.git.status.available,true);
      assert.ok(observation.body.result.structuredContent.git.status.counts.untracked>=1);
    }
  }
  matrix.push({index:idx,inspection:ins,count:want,hash,enginePid:id.enginePid,bootId:id.bootId});
 }
 // The last broker has both tools and one writer. Quiesce refuses new admission afterward.
 const both=children.at(-1);
 const response=await fetch(both.address+'/index-quiesce',{method:'POST',headers:{
   Authorization:'Bearer '+both.token, 'Content-Type':'application/json'},
   body:JSON.stringify({bootId:both.bootId,installationId:both.config.installationId}),
   signal:AbortSignal.timeout(15000)});
 const ack=await response.json();
 assert.equal(response.status,200,JSON.stringify(ack));
 assert.equal(ack.status,'INDEX_QUIESCED');
 assert.equal(ack.writerLeaseReleased,true);
 assert.equal(await fs.stat(both.db+'.writer-lock').then(()=>true,()=>false),false);
 const after=await both.call('tools/call',{name:'inspect_project',arguments:{path:repo}});
 assert.equal(after.body.result?.isError,true,'Shared post-quiesce admission must refuse inspection');
 console.log(JSON.stringify({result:'UNIFIED_MATRIX_PASS',matrix,latency,sharedQuiesce:true,
   postQuiesceInspectionDenied:true}));
});
