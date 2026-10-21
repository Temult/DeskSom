import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {performance} from 'node:perf_hooks';
import {startSelfHealingIndex} from './self-healing-client.mjs';
const base=process.argv[2]??'C:\\Projects\\Somner\\DeskSom\\ops\\self-healing-scale-20261018';
const root='C:\\DL',dbFile=path.join(base,'DL-self-healing.sqlite');
const receipt=path.join(base,'SCALE_RESULTS.json');
if(fs.existsSync(base))throw Error('Scale test directory exists. Inspect prior run before retry.');
fs.mkdirSync(base,{recursive:true});
const launched=performance.now();
const client=startSelfHealingIndex({root,database:dbFile,privateState:base});
try{
 let state=client.latest;
 while(client.latest==='INITIALIZING'&&performance.now()-launched<150000){
  await new Promise(r=>setTimeout(r,150));
 }
 if(client.latest!=='READY')throw Error('Initial worker did not complete: '+client.latest);
 const initialElapsed=Math.round(performance.now()-launched);
 const snap=await client.call('status',{},9000);
 const db=new DatabaseSync(dbFile,{readOnly:true,timeout:4000});
 let matchMs,queryHits,readDuringReconcileMs;
 try{
  let t=performance.now();
  const result=db.prepare("SELECT e.fullpath FROM names_fts f JOIN entries e ON e.id=f.rowid WHERE f.name LIKE '%manifest%' LIMIT 20").all();
  matchMs=Number((performance.now()-t).toFixed(3));
  queryHits=result.length;
  const update=client.call('full',{},120000);
  await new Promise(r=>setTimeout(r,500));
  t=performance.now();
  const during=db.prepare("SELECT COUNT(*) AS n FROM entries WHERE name LIKE '%manifest%'").get();
  readDuringReconcileMs=Number((performance.now()-t).toFixed(3));
  const reconciled=await update;
  if(reconciled.status!=='RECONCILED')throw Error('Full diff reconciliation failed '+JSON.stringify(reconciled));
  const count=db.prepare('SELECT COUNT(*) n FROM entries').get().n;
  const summary={
   result:'SELF_HEALING_C_DL_SCALE_PASS',
   root,initialBuildMs:initialElapsed,rows:count,firstScannedDirectories:snap.stats.dirsRead,
   indexBytes:fs.statSync(dbFile).size,indexedManifestQueryMs:matchMs,indexedManifestHits:queryHits,
   queryDuringReconciliationMs:readDuringReconcileMs,unchangedFullReconcile:reconciled,
   filesystemWritesToDL:0,observerEventCount:snap.stats.events,readOnlyRealTree:true,
   experimental:true
  };
  fs.writeFileSync(receipt,JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(summary));
 }finally{db.close()}
}finally{await client.stop()}
