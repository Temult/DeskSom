// Explicit disposable benchmark; no installed service, tasks or credentials.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {DatabaseSync} from 'node:sqlite';
const [source,fixture,out,label]=process.argv.slice(2);
if(!source||!fixture||!out||!label||fs.existsSync(out))throw Error('Provide source, fixture, new output path, label');
const {createFastFileSearch}=await import(pathToFileURL(path.join(source,'fast-files.mjs')));
const {inspectProject,resolveTrustedGit}=await import(pathToFileURL(path.join(source,'project-inspect.mjs')));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const stats=a=>{const s=[...a].sort((a,b)=>a-b);return {samples:a.length,minMs:s[0],medianMs:s[Math.floor(s.length/2)],p95Ms:s[Math.min(s.length-1,Math.ceil(s.length*.95)-1)],maxMs:s.at(-1)}};
async function timed(fn,n=25){const a=[];for(let i=0;i<n;i++){const t=performance.now();await fn(i);a.push(performance.now()-t)}return stats(a)}
const roots=[0,1,2].map(i=>path.join(fixture,'root-'+i)),repo=path.join(fixture,'repo');
const marker=path.join(fixture,'BENCH_FIXTURE.json');
if(!fs.existsSync(fixture)){
 fs.mkdirSync(fixture);
 for(const r of roots){fs.mkdirSync(r);for(let d=0;d<100;d++){const dir=path.join(r,'folder-'+d);fs.mkdirSync(dir);for(let i=0;i<100;i++)fs.writeFileSync(path.join(dir,'document-'+d+'-'+i+'-benchmark.txt'),'fixture\n',{flag:'wx'})}}
 fs.mkdirSync(repo);fs.writeFileSync(path.join(repo,'README.md'),'Benchmark fixture only\n');
 for(let d=0;d<40;d++){const dir=path.join(repo,'src-'+d);fs.mkdirSync(dir);for(let i=0;i<100;i++)fs.writeFileSync(path.join(dir,'module-'+i+'.js'),'export const n=1;\n')}
 const git=await resolveTrustedGit();
 for(const args of [['init','-q'],['add','.'],['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','core.hooksPath=NUL','commit','-q','-m','disposable benchmark']])execFileSync(git,['-C',repo,...args],{windowsHide:true,stdio:'pipe'});
 fs.writeFileSync(marker,JSON.stringify({schema:'desksom.bench-fixture/v1',roots:3,filesPerRoot:10000,repoFiles:4001}));
}
const manifest=JSON.parse(fs.readFileSync(marker,'utf8'));assert.equal(manifest.schema,'desksom.bench-fixture/v1');
const state=fs.mkdtempSync(path.join(fixture,'state-'+label+'-'));
const indices=roots.map((root,i)=>({root,database:path.join(state,'index-'+i+'.sqlite')}));
const report={schema:'desksom.performance-sweep/v1',label,source,at:new Date().toISOString(),node:process.versions.node,sqlite:process.versions.sqlite,platform:process.platform,logicalProcessors:os.cpus().length,fixture:manifest,measurements:{},notes:['Same-host local timings; not ChatGPT network latency.','Cold means new SQLite database; filesystem caches are not flushed.','Fixture creation excluded from timings.']};
const cfg={stateDir:state,allowedDirectories:roots,fastFilenameIndex:{enabled:true,selfHealing:true,periodicReconcileMs:300000,indices}};
let index;
try{
 const cpu=process.cpuUsage(),t=performance.now();index=createFastFileSearch(cfg);await index.ready();
 report.measurements.threeRootColdBuildMs=performance.now()-t;report.measurements.coldBuildCpuMs=(process.cpuUsage(cpu).user+process.cpuUsage(cpu).system)/1000;
 report.measurements.rssAfterBuildMiB=process.memoryUsage().rss/1048576;
 const query=async(q,limit=10)=>{const v=await index.search({root:roots[0],query:q,limit});assert.notEqual(v.isError,true,JSON.stringify(v));return v.structuredContent};
 assert.equal((await query('document-99-99')).results.length,1);
 report.measurements.rareSearch=await timed(()=>query('document-99-99'));
 report.measurements.missingSearch=await timed(async()=>assert.equal((await query('not-in-this-fixture')).results.length,0));
 report.measurements.commonSearch=await timed(()=>query('benchmark',6));
 report.measurements.shortSearch=await timed(()=>query('99',6));
 function walk(root,q){let count=0;const stack=[root];while(stack.length){const dir=stack.pop();for(const d of fs.readdirSync(dir,{withFileTypes:true})){if(d.isDirectory())stack.push(path.join(dir,d.name));else if(d.name.includes(q))count++}}return count}
 report.measurements.filenameTraversal=await timed(()=>assert.equal(walk(roots[0],'document-99-99'),1),5);
 report.measurements.verifyMiss=await timed(async()=>{const r=await index.search({root:roots[0],query:'not-in-this-fixture',verifyMiss:true});assert.equal(r.structuredContent.repairStatus,'RECONCILED')},3);
 const db=new DatabaseSync(indices[0].database,{readOnly:true});
 report.sqlPlans={escaped:db.prepare("EXPLAIN QUERY PLAN SELECT rowid FROM names_fts WHERE name LIKE ? ESCAPE '\\'").all('%document-99-99%'),plain:db.prepare('EXPLAIN QUERY PLAN SELECT rowid FROM names_fts WHERE name LIKE ?').all('%document-99-99%')};
 report.measurements.sqlEscaped=await timed(()=>db.prepare("SELECT rowid FROM names_fts WHERE name LIKE ? ESCAPE '\\'").all('%document-99-99%'));
 report.measurements.sqlPlain=await timed(()=>db.prepare('SELECT rowid FROM names_fts WHERE name LIKE ?').all('%document-99-99%'));db.close();
 const event=monitorEventLoopDelay({resolution:10});event.enable();await sleep(30);
 report.measurements.concurrentSearch12=await timed(()=>Promise.all(Array.from({length:12},()=>query('document-99-99'))),5);
 await sleep(30);event.disable();report.measurements.eventLoopP95DuringQueriesMs=event.percentile(95)/1e6;
 const git=await resolveTrustedGit();
 const inspect=()=>inspectProject({requestedPath:repo,allowedRoots:[repo],trustedGitExecutable:git});
 const first=await timed(async()=>assert.equal((await inspect()).git.detected,true),1);report.measurements.projectInspectionFirst=first;
 report.measurements.projectInspectionWarm=await timed(async()=>{const r=await inspect();assert.equal(r.git.inventory.trackedFilesObserved,4001);assert.equal(r.git.status.complete,true)},15);
 report.measurements.concurrentInspection12=await timed(()=>Promise.all(Array.from({length:12},async()=>assert.equal((await inspect()).git.detected,true))),3);
 const idleCpu=process.cpuUsage(),idleStart=performance.now();await sleep(2000);const idle=process.cpuUsage(idleCpu);
 report.measurements.idleWindowMs=performance.now()-idleStart;report.measurements.idleCpuMs=(idle.user+idle.system)/1000;
 const stopStart=performance.now();assert.equal((await index.stop()).status,'STOPPED');index=null;report.measurements.cleanStopMs=performance.now()-stopStart;
 const restartStart=performance.now();index=createFastFileSearch(cfg);await index.ready();report.measurements.threeRootWarmReopenMs=performance.now()-restartStart;
 assert.equal((await index.stop()).status,'STOPPED');index=null;
 report.databaseMiB=indices.map(x=>fs.statSync(x.database).size/1048576);report.passed=true;
}catch(error){report.passed=false;report.error=error.stack;throw error}
finally{if(index){report.stop=await index.stop()}await fsp.writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report))}
