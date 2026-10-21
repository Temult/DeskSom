// Alternating same-process A/B comparison. Uses only a marked disposable fixture.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
const [before,after,fixture,out]=process.argv.slice(2);
if(!before||!after||!fixture||!out||fs.existsSync(out))throw Error('Provide two sources, marked fixture, and new report path');
const manifest=JSON.parse(fs.readFileSync(path.join(fixture,'BENCH_FIXTURE.json'),'utf8'));assert.equal(manifest.schema,'desksom.bench-fixture/v1');
const root=path.join(fixture,'root-0'),repo=path.join(fixture,'repo');
const percentile=(a,p)=>[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.ceil(a.length*p)-1)];
const stats=a=>({samples:a.length,medianMs:percentile(a,.5),p95Ms:percentile(a,.95),maxMs:Math.max(...a)});
const report={schema:'desksom.performance-paired/v1',at:new Date().toISOString(),node:process.versions.node,sqlite:process.versions.sqlite,
 scope:'same process, alternating order, same 10000-file root and 4001-file repository; separate private indices; no live services',sources:{before,after},measurements:{}};
const systems=[];
try{
 for(const source of [before,after]){
  const state=fs.mkdtempSync(path.join(fixture,'paired-state-')),m=await import(pathToFileURL(path.join(source,'fast-files.mjs'))),p=await import(pathToFileURL(path.join(source,'project-inspect.mjs')));
  const index=m.createFastFileSearch({stateDir:state,allowedDirectories:[root],fastFilenameIndex:{enabled:true,selfHealing:true,periodicReconcileMs:300000,indices:[{root,database:path.join(state,'index.sqlite')}]}});
  systems.push({index,p});await index.ready();
 }
 async function query(system,q,limit=6){const r=await system.index.search({root,query:q,limit});assert.notEqual(r.isError,true,JSON.stringify(r));return r.structuredContent}
 async function paired(name,fn,n){const values=[[],[]];for(let i=0;i<n;i++){for(const k of i%2?[1,0]:[0,1]){const t=performance.now();await fn(systems[k],i);values[k].push(performance.now()-t)}}report.measurements[name]={before:stats(values[0]),after:stats(values[1])}}
 for(const s of systems)for(let n=0;n<4;n++)await query(s,'document-99-99');
 await paired('rareSearch',s=>query(s,'document-99-99'),60);
 await paired('missingSearch',async s=>assert.equal((await query(s,'not-in-this-fixture')).results.length,0),60);
 await paired('commonSearch',s=>query(s,'benchmark'),60);
 await paired('shortSearch',s=>query(s,'99'),60);
 await paired('concurrentSearch12',s=>Promise.all(Array.from({length:12},()=>query(s,'document-99-99'))),10);
 await paired('inspectionWarm',async s=>{const r=await s.p.inspectProject({requestedPath:repo,allowedRoots:[repo]});assert.equal(r.git.inventory.trackedFilesObserved,4001)},15);
 await paired('concurrentInspection12',s=>Promise.all(Array.from({length:12},()=>s.p.inspectProject({requestedPath:repo,allowedRoots:[repo]}))),3);
 for(const [k,s]of systems.entries()){
  const delay=monitorEventLoopDelay({resolution:1});delay.enable();await new Promise(r=>setTimeout(r,15));
  for(let i=0;i<5;i++)await Promise.all(Array.from({length:12},()=>query(s,'document-99-99')));
  await new Promise(r=>setTimeout(r,15));delay.disable();report.measurements['eventLoopP95'+(k?'After':'Before')+'Ms']=delay.percentile(95)/1e6;
 }
 report.passed=true;
} catch(error){report.passed=false;report.error=error.stack;throw error}
finally{report.stop=[];for(const s of systems)report.stop.push(await s.index.stop());if(report.stop.some(s=>s.status!=='STOPPED'))report.passed=false;fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report))}
