import fs from 'node:fs';import fsp from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {spawn} from 'node:child_process';import {randomBytes,randomUUID} from 'node:crypto';import {performance} from 'node:perf_hooks';import assert from 'node:assert/strict';
const [source,fixture,out]=process.argv.slice(2);if(!source||!fixture||!out||fs.existsSync(out))throw Error('New output path and marked benchmark fixture required');
assert.equal(JSON.parse(fs.readFileSync(path.join(fixture,'BENCH_FIXTURE.json'),'utf8')).schema,'desksom.bench-fixture/v1');
const state=fs.mkdtempSync(path.join(fixture,'broker-state-')),roots=[0,1,2].map(i=>path.join(fixture,'root-'+i)),repo=path.join(fixture,'repo');
fs.mkdirSync(path.join(state,'dc'));const installationId=randomUUID(),token=randomBytes(32).toString('hex');
const cfg={expectedHost:os.hostname(),instance:'performance-fixture',installationId,sourceFingerprint:'f'.repeat(64),stateDir:state,workDir:fixture,allowedDirectories:[...roots,repo],enableProjectInspect:true,
 fastFilenameIndex:{enabled:true,selfHealing:true,periodicReconcileMs:300000,indices:roots.map((root,i)=>({root,database:path.join(state,'index-'+i+'.sqlite')}))}};
fs.writeFileSync(path.join(state,'settings.json'),JSON.stringify(cfg));fs.writeFileSync(path.join(state,'dc/config.json'),JSON.stringify({allowedDirectories:cfg.allowedDirectories,defaultShell:'pwsh.exe',telemetryEnabled:false,pendingWelcomeOnboarding:false,welcomeOnboardingEligible:false}));
const statusFile=path.join(state,'startup.json'),t0=performance.now(),child=spawn(process.execPath,[path.join(source,'broker.mjs'),'--config',path.join(state,'settings.json'),'--port','0','--status-file',statusFile],{cwd:source,windowsHide:true,env:{...process.env,DESKSOM_HTTP_TOKEN:token,DESKTOP_COMMANDER_DISABLE_TELEMETRY:'1'},stdio:['ignore','pipe','pipe']});
child.stdout.resume();let stderr='';child.stderr.on('data',b=>{stderr=(stderr+b).slice(-2000)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),alive=()=>child.exitCode===null&&child.signalCode===null;
const summary=a=>{const s=a.sort((a,b)=>a-b);return {samples:s.length,medianMs:s[Math.floor(s.length/2)],p95Ms:s[Math.min(s.length-1,Math.ceil(s.length*.95)-1)],maxMs:s.at(-1)}};
async function timed(fn,n){const a=[];for(let i=0;i<n;i++){const t=performance.now();await fn(i);a.push(performance.now()-t)}return summary(a)}
const report={schema:'desksom.loopback-performance/v1',at:new Date().toISOString(),source,node:process.versions.node,scope:'real loopback broker, 3 synthetic roots / 30000 files and 4001-file Git repo; no installed service or tunnel',measurements:{}};
let startup;const additions=[];
try{
 const deadline=Date.now()+30000;while(Date.now()<deadline){if(!alive())throw Error('Fixture broker exited '+stderr);try{startup=JSON.parse(fs.readFileSync(statusFile));break}catch{}await sleep(20)}assert.ok(startup?.address,'Startup bound exceeded');
 report.measurements.coreStartupMs=performance.now()-t0;
 const meta={'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'perf-fixture',version:'1'},'io.modelcontextprotocol/clientCapabilities':{}};
 async function call(name,args={}){const r=await fetch(startup.address+'/mcp',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream',Authorization:'Bearer '+token,'Mcp-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':name},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args,_meta:meta}}),signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);return (await r.json()).result}
 const first=(await call('desksom_status')).structuredContent;assert.equal(first.ready,true);report.indexReadyAtFirstStatus=first.indexWorkerReady;
 const during=[];for(let i=0;i<150;i++){const t=performance.now(),s=(await call('desksom_status')).structuredContent;during.push(performance.now()-t);if(s.indexWorkerReady)break;await sleep(20)}
 assert.equal((await call('desksom_status')).structuredContent.indexWorkerReady,true);report.measurements.allIndicesReadyMs=performance.now()-t0;report.measurements.statusWhileWaiting=summary(during);
 report.measurements.status=await timed(async()=>assert.equal((await call('desksom_status')).structuredContent.ready,true),40);
 report.measurements.read=await timed(async()=>assert.notEqual((await call('read_file',{path:path.join(roots[0],'folder-99','document-99-99-benchmark.txt')})).isError,true),20);
 report.measurements.indexSearch=await timed(async()=>assert.equal((await call('find_files_fast',{root:roots[0],query:'document-99-99'})).structuredContent.results.length,1),40);
 report.measurements.inspection=await timed(async()=>assert.equal((await call('inspect_project',{path:repo})).structuredContent.git.inventory.trackedFilesObserved,4001),10);
 report.measurements.writeAndImmediateSearch=await timed(async i=>{const file=path.join(roots[0],'folder-0','tool-created-'+randomUUID()+'.txt');additions.push(file);assert.notEqual((await call('write_file',{path:file,content:'fixture '+i,mode:'rewrite'})).isError,true);assert.equal((await call('find_files_fast',{root:roots[0],query:path.basename(file)})).structuredContent.results.length,1)},10);
 report.measurements.externalCreateVisible=await timed(async()=>{const file=path.join(roots[1],'folder-0','watch-created-'+randomUUID()+'.txt');additions.push(file);await fsp.writeFile(file,'fixture');const until=Date.now()+5000;let found=false;while(Date.now()<until){const v=await call('find_files_fast',{root:roots[1],query:path.basename(file)});if(v.structuredContent?.results?.length===1){found=true;break}await sleep(20)}assert.ok(found)},10);
 report.measurements.mixedConcurrentBatch=await timed(()=>Promise.all(Array.from({length:12},(_,i)=>i%3===0?call('desksom_status'):i%3===1?call('find_files_fast',{root:roots[i%3],query:'document-99-99'}):call('read_file',{path:path.join(roots[0],'folder-0','document-0-0-benchmark.txt')}))).then(results=>assert.ok(results.every(r=>r.isError!==true))),10);
 report.passed=true;
}catch(error){report.passed=false;report.error=error.stack;throw error}
finally{
 if(startup&&alive()){
  const t=performance.now(),r=await fetch(startup.address+'/index-quiesce',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({installationId,bootId:startup.bootId}),signal:AbortSignal.timeout(12000)});
  report.shutdown=await r.json();report.measurements.acknowledgedQuiesceMs=performance.now()-t;assert.equal(r.status,200);assert.equal(report.shutdown.writerLeaseReleased,true);
 }
 if(alive()){const exited=new Promise(r=>child.once('exit',r));child.kill();await Promise.race([exited,sleep(3000)])}
 report.childExited=!alive();for(const f of additions)await fsp.unlink(f);
 fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
}
