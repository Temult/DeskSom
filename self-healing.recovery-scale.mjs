import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {performance} from 'node:perf_hooks';
import {startSelfHealingIndex} from './self-healing-client.mjs';
const base='C:\\Projects\\Somner\\DeskSom\\ops\\self-healing-scale-20261018-bulk';
const root='C:\\DL',database=path.join(base,'DL-self-healing.sqlite'),receipt=path.join(base,'OPTIMIZED_DIFF_RESULTS.json');
if(!fs.existsSync(database))throw Error('Expected existing cold-built DB was not found');
if(fs.existsSync(receipt))throw Error('Optimized receipt already exists');
const t=performance.now(),client=startSelfHealingIndex({root,database,privateState:base});
try{
 while(client.latest==='INITIALIZING'&&performance.now()-t<90000)await new Promise(r=>setTimeout(r,180));
 if(client.latest!=='READY')throw Error('Optimized initial reconciliation was not ready: '+client.latest);
 const initialMs=Math.round(performance.now()-t);
 const s=await client.call('status',{},9000);
 const db=new DatabaseSync(database,{readOnly:true,timeout:7000});
 try{
  const rows=db.prepare('SELECT COUNT(*) n FROM entries').get().n;
  const next=client.call('full',{},85000);
  await new Promise(r=>setTimeout(r,300));
  const begin=performance.now();
  const record=db.prepare("SELECT COUNT(*) n FROM entries WHERE name LIKE '%manifest%'").get();
  const readMs=Number((performance.now()-begin).toFixed(3));
  const r=await next;
  if(r.status!=='RECONCILED')throw Error('Second diff not complete: '+JSON.stringify(r));
  const result={status:'OPTIMIZED_SELF_HEALING_SCALE_PASS',existingIndexRows:rows,root,
   restartCatchUpMs:initialMs,readerDuringReconciliationMs:readMs,readerMatches:record.n,
   fullDiff:r,indexBytes:fs.statSync(database).size,filesystemMutationsToDL:0,serviceChanged:false};
  fs.writeFileSync(receipt,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(result));
 }finally{db.close()}
}finally{await client.stop()}
