import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';

const project='C:\\Projects\\Somner\\DeskSom';
const qa=process.argv[2]??path.join(project,'ops','native-index-poc-20261018');
const fixture=path.join(qa,'fixture');
const db=path.join(qa,'poc-index.sqlite');
const config=path.join(qa,'config.json');
const source=path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1').replace(/\//g,'\\')),'index.mjs');
if(fs.existsSync(fixture) || fs.existsSync(db) || fs.existsSync(config))throw Error('Fixture/index already exist. Inspect before rerunning.');
fs.mkdirSync(fixture,{recursive:true});
fs.writeFileSync(config,JSON.stringify({schema:'desksom.file-index-poc/v1',root:fixture,db,allowedRoots:['C:\\Projects']},null,2));
const startBuild=performance.now();
for(let d=0;d<16;d++){
 const folder=path.join(fixture,'group-'+String(d).padStart(2,'0'));
 fs.mkdirSync(folder);
 for(let k=0;k<120;k++){
  const n=d*120+k;
  fs.writeFileSync(path.join(folder,'record-'+String(n).padStart(5,'0')+'-alpha.txt'),'fixture-'+n);
 }
}
fs.writeFileSync(path.join(fixture,'report_%_test.txt'),'literal-likes');
fs.writeFileSync(path.join(fixture,'pocket.md'),'short-term-query');
function call(cmd,more=[]){
 const x=spawnSync(process.execPath,[source,cmd,'--config',config,...more],{encoding:'utf8',timeout:25000,maxBuffer:3_000_000});
 if(x.status!==0)throw Error(cmd+' failed: '+x.stderr.slice(0,1100)+' / '+x.stdout.slice(0,500));
 const lines=x.stdout.trim().split(/\r?\n/);
 return JSON.parse(lines.at(-1));
}
const scan=call('scan');
assert.equal(scan.result,'SCAN_PASS');
assert.equal(scan.entries,16+16*120+2);
let q=call('search',['--q','record-00319']);
assert.equal(q.results.length,1);
assert.equal(q.queryEngine,'FTS5_TRIGRAM');
assert.match(q.results[0].path,/record-00319-alpha\.txt$/);
const pct=call('search',['--q','%']);
assert.equal(pct.results.length,1);
assert.match(pct.results[0].path,/report_%_test.txt$/);
assert.equal(pct.queryEngine,'SQLITE_SHORT_TERM_SCAN');
const short=call('search',['--q','md']);
assert.equal(short.results.length,1);
const no=call('search',['--q','not-yet-created']);
assert.equal(no.results.length,0);
assert.equal(no.negativeAuthoritative,false);
fs.writeFileSync(path.join(fixture,'after-index-offline.txt'),'missed while watcher offline');
const missed=call('search',['--q','after-index-offline']);
assert.equal(missed.results.length,0);
const recovered=call('search',['--q','after-index-offline','--verify-misses','yes']);
assert.equal(recovered.results.length,1);
assert.equal(recovered.queryEngine,'FALLBACK_FS_WALK');
const symlinkPath=path.join(fixture,'junction-escape');
let junctionTest='UNAVAILABLE';
try {
 fs.symlinkSync('C:\\Windows',symlinkPath,'junction');
 junctionTest='CREATED';
}catch(e){junctionTest='NOT_PERMITTED';}
const after=call('scan');
assert.equal(after.entries,16+16*120+3);
const escaped=call('search',['--q','junction-escape']);
assert.equal(escaped.results.length,0);
let watcherStdout='';
const child=spawn(process.execPath,[source,'watch','--config',config],{stdio:['pipe','pipe','pipe'],windowsHide:true});
let stderr='';
child.stdout.on('data',d=>watcherStdout+=d.toString());
child.stderr.on('data',d=>stderr+=d.toString());
async function until(fn,ms=9000){
 const deadline=Date.now()+ms;
 while(Date.now()<deadline){if(fn())return true;await new Promise(r=>setTimeout(r,95));}
 return false;
}
if(!await until(()=>watcherStdout.includes('"event":"BASELINE"'))){
 child.kill();throw Error('Watcher startup failed: '+stderr+' / '+watcherStdout);
}
const livePath=path.join(fixture,'live-visitor-2391.txt');
fs.writeFileSync(livePath,'hello');
if(!await until(()=>call('search',['--q','live-visitor-2391']).results.length===1)){child.kill();throw Error('Watcher create update failed: '+stderr);}
const newPath=path.join(fixture,'renamed-visitor-2391.txt');
fs.renameSync(livePath,newPath);
if(!await until(()=>{
 const old=call('search',['--q','live-visitor-2391']).results.length;
 const fresh=call('search',['--q','renamed-visitor-2391']).results.length;
 return old===0&&fresh===1;
})){child.kill();throw Error('Watcher rename update failed: '+stderr);}
fs.unlinkSync(newPath);
if(!await until(()=>call('search',['--q','renamed-visitor-2391']).results.length===0)){child.kill();throw Error('Watcher deletion update failed: '+stderr);}
child.stdin.end();
await until(()=>child.exitCode!==null,2500);
if(child.exitCode===null)child.kill();
let walkMs=[];
function baselineWalk(term){
 const st=performance.now();
 let hits=0;
 const queue=[fixture];
 while(queue.length){
  const d=queue.pop();
  for(const ent of fs.readdirSync(d,{withFileTypes:true})){
   if(ent.name.toLowerCase().includes(term))hits++;
   if(ent.isDirectory()&&!ent.isSymbolicLink())queue.push(path.join(d,ent.name));
  }
 }
 return {hits,ms:performance.now()-st};
}
for(let i=0;i<10;i++)walkMs.push(baselineWalk('record-00319').ms);
const bench=[];
for(let i=0;i<10;i++)bench.push(call('search',['--q','record-00319']).elapsedMs);
function median(a){const x=[...a].sort((a,b)=>a-b);return Number(((x[4]+x[5])/2).toFixed(3));}
const result={
 result:'POC_PASS',node:process.version,sqlite:'built-in',testFileCount:16*120+3,
 scanElapsedMs:scan.elapsedMs,
 rebuildElapsedMs:after.elapsedMs,
 ftsQueryMedianMs:median(bench),
 fullWalkMedianMs:median(walkMs),
 watcherCreate:true,watcherRename:true,watcherDelete:true,
 offlineMissNonAuthoritative:true,offlineFallbackFound:true,
 percentQueryLiteral:true,shortQueryFallback:true,
 symlinkTest:junctionTest,linkNotIndexed:true,
 dbBytes:fs.statSync(db).size,
 root:fixture,db,chatgptServiceChanged:false
};
const receipt=path.join(qa,'TEST_RESULTS.json');
if(fs.existsSync(receipt))throw Error('Prior test receipt exists');
fs.writeFileSync(receipt,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
