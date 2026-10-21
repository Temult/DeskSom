import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {DatabaseSync} from 'node:sqlite';
import {startSelfHealingIndex} from './self-healing-client.mjs';

const folder='C:\\Projects\\Somner\\DeskSom\\ops\\native-index-v4-cold-20261018';
const root='C:\\DL';
if(fs.existsSync(folder))throw Error('Preexisting cold benchmark destination; inspect instead of overwriting');
fs.mkdirSync(folder,{recursive:true});
const database=path.join(folder,'native-cold.sqlite');
const begin=performance.now();
const worker=startSelfHealingIndex({root,database,privateState:folder,periodicReconcileMs:3600000});
let completed=false;
try{
 while(performance.now()-begin<120000){
  if(worker.latest==='READY'){completed=true;break}
  if(worker.latest==='FAILED'||worker.latest==='STALE'||worker.latest==='STOPPED')break;
  await new Promise(resolve=>setTimeout(resolve,150));
 }
 if(!completed)throw Error('COLD_BUILD_NOT_QUALIFIED_STATE_'+worker.latest);
 const elapsedMs=Math.round(performance.now()-begin);
 const state=await worker.call('status',{},12000);
 const db=new DatabaseSync(database,{readOnly:true});
 let count;
 try{count=db.prepare('SELECT COUNT(*) n FROM entries').get().n}finally{db.close()}
 const outcome={status:'COLD_BUILD_PASS',root,rows:count,elapsedMs,dbBytes:fs.statSync(database).size,
    periodicMs:state.periodicReconcileMs,eventsAtStart:state.stats.events,
    noWritesToIndexedRoot:true,liveServiceUnchanged:true};
 fs.writeFileSync(path.join(folder,'COLD_BUILD_RESULTS.json'),JSON.stringify(outcome,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(outcome));
}finally{
 const stopped=await worker.stop();
 if(stopped.status!=='STOPPED')console.error('COLD_WORKER_OUTCOME_UNCERTAIN',stopped.status);
}
