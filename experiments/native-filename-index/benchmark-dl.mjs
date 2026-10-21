import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
const base='C:\\Projects\\Somner\\DeskSom';
const script=path.join(base,'workspaces','native-index-git-candidate-20261018','experiments','native-filename-index','index-v2.mjs');
const dataDir=path.join(base,'ops','native-index-scale-20261018');
const config=path.join(dataDir,'dl-config.json');
const queries=['A21','manifest','not-a-real-name-zzzz261018'];
const repeats=12;
function one(action,query){
 const before=performance.now();
 const result=spawnSync(process.execPath,[script,action,'--config',config,'--q',query,'--limit','30','--max-ms','20000','--max-items','500000'],{encoding:'utf8',maxBuffer:2_000_000,timeout:25000});
 const ms=performance.now()-before;
 if(result.status!==0)throw Error(action+' '+query+': '+result.stderr.slice(-900));
 const lines=result.stdout.trim().split(/\r?\n/),body=JSON.parse(lines.at(-1));
 return {wallMs:Number(ms.toFixed(2)),queryMs:body.indexedQueryMs??body.elapsedMs,resultCount:body.results.length,complete:body.complete??null,indexState:body.indexState??null};
}
function median(arr){const v=[...arr].sort((a,b)=>a-b);return Number(((v[(v.length-1)>>1]+v[v.length>>1])/2).toFixed(3))}
const tests=[];
for(const q of queries){
 const warm=[];for(let i=0;i<repeats;i++)warm.push(one('search',q));
 const walk=one('walk',q);
 tests.push({query:q,indexedMedianQueryMs:median(warm.map(x=>x.queryMs)),indexedMedianWallMs:median(warm.map(x=>x.wallMs)),indexedResults:warm.at(-1).resultCount,walkWallMs:walk.wallMs,walkResults:walk.resultCount,walkComplete:walk.complete,sourceIndexState:warm.at(-1).indexState});
}
const results={schema:'desksom.native-index-dl-benchmark/v1',result:'PASS',sourceRoot:'C:\\DL',queryRepeats:repeats,results:tests,access:'read-only C:\\DL with database stored under C:\\Projects',productionServiceChanged:false};
const receipt=path.join(dataDir,'DL_BENCHMARK.json');
if(fs.existsSync(receipt))throw Error('Existing benchmark receipt');
fs.writeFileSync(receipt,JSON.stringify(results,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(results));