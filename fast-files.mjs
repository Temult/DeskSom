// Optional native filename search; default read-only snapshot or owner opt-in self-healing worker.
import fs from 'node:fs';
import path from 'node:path';
import {startSelfHealingIndex} from './self-healing-client.mjs';
import {indexWriterLeaseAbsent} from './index-writer-lock.mjs';
import {filenameQuery} from './filename-query.mjs';

const normalize=p=>path.win32.resolve(p).replace(/\\+$/,'').toLowerCase();
const inside=(root,p)=>normalize(p)===normalize(root)||normalize(p).startsWith(normalize(root)+'\\');
const err=(code,message)=>({isError:true,content:[{type:'text',text:code+': '+message}],structuredContent:{status:code,absenceAuthoritative:false}});
const text=v=>({content:[{type:'text',text:JSON.stringify(v)}],structuredContent:v});
export const fastTool={
 name:'find_files_fast',
 description:'Optional filename-substring index search. A self-healing index processes file events and known writes when configured. Search misses are advisory; verifyMiss reconciles the entire root and indexes differences before repeating a miss. Never infer absence from an unverified snapshot.',
 annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
 inputSchema:{
  type:'object',properties:{
   root:{type:'string',description:'Exact configured/authorized root'},
   query:{type:'string',description:'Case-insensitive basename substring, 1-256 characters'},
   limit:{type:'integer',minimum:1,maximum:100,default:30},
   verifyMiss:{type:'boolean',description:'If no results, perform and await a bounded full-tree differential reconciliation before searching again.'}
  },required:['root','query'],additionalProperties:false
 }
};
export function createFastFileSearch(cfg){
 const feature=cfg.fastFilenameIndex;
 if(feature?.enabled!==true)return null;
 if(!Array.isArray(feature.indices)||feature.indices.length<1||feature.indices.length>12)throw Error('FAST_INDEX_CONFIG_INVALID');
 if(!path.win32.isAbsolute(cfg.stateDir))throw Error('FAST_INDEX_STATE_NOT_ABSOLUTE');
 const realState=fs.realpathSync.native(cfg.stateDir);
 const approved=cfg.allowedDirectories??[];
 const allowed=approved.flatMap(p=>{try{return [fs.realpathSync.native(p)]}catch{return []}});
 const bound=new Map();
 for(const i of feature.indices){
  if(!i||typeof i.root!=='string'||typeof i.database!=='string')throw Error('FAST_INDEX_CONFIG_INVALID');
  if(!path.win32.isAbsolute(i.root)||!path.win32.isAbsolute(i.database))throw Error('FAST_INDEX_PATH_NOT_ABSOLUTE');
  let r,unavailable=false;
  try{r=fs.realpathSync.native(i.root)}catch{r=i.root;unavailable=true}
  // Missing roots grant no access. Retain only an exact selected/approved name
  // for diagnostics; do not start a writer or search its old database.
  if(unavailable?!approved.some(a=>normalize(a)===normalize(i.root)):!allowed.some(a=>normalize(a)===normalize(r)))throw Error('FAST_INDEX_ROOT_NOT_APPROVED');
  const dbFolder=fs.realpathSync.native(path.dirname(i.database));
  if(!inside(realState,dbFolder))throw Error('FAST_INDEX_DB_NOT_PRIVATE');
  if(bound.has(normalize(r)))throw Error('FAST_INDEX_DUPLICATE_ROOT');
  bound.set(normalize(r),{root:r,database:i.database,unavailable});
 }
 const live=feature.selfHealing===true;
 const clients=new Map();
 if(live)for(const item of bound.values()){
  if(item.unavailable)continue;
  clients.set(normalize(item.root),startSelfHealingIndex({...item,privateState:realState,periodicReconcileMs:feature.periodicReconcileMs??1800000}));
 }
 const rootHealthy=item=>!!item&&!item.unavailable&&(!live||clients.get(normalize(item.root))?.latest==='READY');
 const health=root=>root?rootHealthy(bound.get(normalize(root))):[...bound.values()].every(rootHealthy);
 const snapshot=()=>({enabled:true,selfHealing:live,ready:health(),roots:[...bound.values()].map(item=>({
  root:item.root,...(clients.get(normalize(item.root))?.snapshot?.()??(item.unavailable?{state:'UNAVAILABLE',errorCode:'ROOT_UNAVAILABLE'}:{state:'SNAPSHOT'})),
  ready:health(item.root)
 }))});
 const ready=async()=>{
  if(!live)return {status:'DISABLED'};
  const responses=await Promise.all([...clients.values()].map(c=>c.whenReady()));
  if([...bound.values()].some(item=>item.unavailable)||responses.some(r=>r.status!=='READY'))
   throw Object.assign(new Error('INDEX_WORKER_NOT_READY'),{code:'INDEX_WORKER_NOT_READY'});
  return {status:'READY'};
 };
 async function readQuery(item,arg,{repair=null,flush=null}={}){
  if(!fs.existsSync(item.database))return text({status:'INDEX_BUILDING',root:item.root,results:[],absenceAuthoritative:false,nextAction:'Initial index unavailable; use start_search or retry later.'});
  let db;
  try{
   const {DatabaseSync}=await import('node:sqlite');
   const realDb=fs.realpathSync.native(item.database);
   if(!inside(realState,realDb))return err('INDEX_PATH_CHANGED','Index moved outside its private state.');
   db=new DatabaseSync(item.database,{readOnly:true,timeout:2000});
   const read=db.prepare('SELECT val FROM meta WHERE key=?');
   if(read.get('root')?.val!==normalize(item.root))return err('INDEX_ROOT_MISMATCH','Index belongs to another root.');
   const state=read.get('state')?.val??'UNKNOWN',name=arg.query.toLowerCase(),limit=arg.limit??30;
   if(live&&(state!=='WATCHING_BEST_EFFORT'||!health(item.root)))return err('INDEX_WORKER_UNAVAILABLE','Index health changed during reconciliation. Use ordinary search.');
   const max=Math.min(1000,limit*10),plan=filenameQuery(name,max);
   const found=db.prepare(plan.sql).all(...plan.parameters),results=[];
   let checked=0;
   for(const row of found){
    checked++;
    if(!inside(item.root,row.path))continue;
    try{
     if(fs.lstatSync(row.path).isSymbolicLink())continue;
     if(!inside(item.root,fs.realpathSync.native(row.path)))continue;
     results.push(row);if(results.length>=limit)break;
    }catch{}
   }
   return text({status:'INDEXED_RESULTS',root:item.root,query:arg.query,results,indexState:state,
    lastScan:read.get('lastFull')?.val??read.get('lastScan')?.val??null,
    candidatesChecked:checked,candidatesFetched:found.length,possibleTruncation:found.length>=max||checked<found.length,
    queryStrategy:plan.strategy,
    absenceAuthoritative:false,searchIsContentSearch:false,
    selfHealing:live && health(item.root),flushStatus:flush?.status??null,repairStatus:repair?.status??null,
    nextAction:results.length?'Read or inspect matching files with the ordinary authorized tools.':'No indexed hit. Use verifyMiss or start_search before concluding the file is absent.'});
  }catch{return err('FAST_INDEX_READ_FAILED','Index cannot be read; use start_search instead.')}
  finally{try{db?.close()}catch{}}
 }
 async function search(arg={}){
  if(!arg||typeof arg.root!=='string'||typeof arg.query!=='string' ||
    arg.query.length<1||arg.query.length>256||/[\u0000-\u001F]/.test(arg.query)||
    (arg.limit!==undefined&&(!Number.isSafeInteger(arg.limit)||arg.limit<1||arg.limit>100))||
    (arg.verifyMiss!==undefined&&typeof arg.verifyMiss!=='boolean'))
    return err('INVALID_QUERY','Use a configured root and bounded filename substring.');
  const item=bound.get(normalize(arg.root));
  if(!item)return err('ROOT_NOT_INDEXED','Root is not explicitly approved for indexed search.');
  if(item.unavailable)return err('ROOT_UNAVAILABLE','This selected root was unavailable at startup. Restore it and deliberately restart indexing; ordinary tools remain available.');
  let current;
  try{current=fs.realpathSync.native(arg.root)}catch{return err('ROOT_UNAVAILABLE','Root cannot be verified.')}
  if(normalize(current)!==normalize(item.root))return err('ROOT_CHANGED','Root path now resolves elsewhere.');
  const client=clients.get(normalize(item.root));
  if(client&&client.latest!=='READY'){
   const state=client.latest;
   const result=err(state==='INITIALIZING'?'INDEX_BUILDING':'INDEX_WORKER_UNAVAILABLE',
    'This root is not ready. Ordinary file and terminal tools remain available; use start_search.');
   result.structuredContent.index=client.snapshot();
   return result;
  }
  const flushed=client?await client.call('flush',{},2500):null;
  if(client&&!['NO_CHANGES','RECONCILED'].includes(flushed?.status))
   return err('INDEX_RECONCILIATION_UNAVAILABLE','Index worker flush could not be verified. Use ordinary start_search.');
  // Yield between worker reconciliation and bounded synchronous SQLite work.
  // Concurrent search calls must not monopolize the broker microtask queue.
  await new Promise(resolve=>setImmediate(resolve));
  let result=await readQuery(item,arg,{flush:flushed});
  if(client&&arg.verifyMiss===true&&!result.isError&&result.structuredContent?.results?.length===0){
   const repaired=await client.call('full',{},45000);
   // If the repair could not complete, continue reporting advisory results, never certain absence.
   result=await readQuery(item,arg,{flush:flushed,repair:repaired});
  }
  return result;
 }
 async function notifyCompletedWrite(name,args={}){
  if(!live)return {status:'DISABLED'};
  if(!new Set(['write_file','write_pdf','edit_block','move_file','create_directory']).has(name))return {status:'NOT_FILE_MUTATION'};
  const paths=['path','file_path','source','destination','outputPath','sourcePath','destinationPath']
   .map(p=>args[p]).filter(p=>typeof p==='string'&&path.win32.isAbsolute(p));
  const results=[];
  for(const item of bound.values()){
   const targets=paths.filter(p=>inside(item.root,p));
   if(targets.length){
    const client=clients.get(normalize(item.root));
    // An acknowledged file write must not wait behind an initial full crawl.
    // The watcher and subsequent full reconciliation cover the skipped hint.
    results.push(client?.latest==='READY'
      ?await client.call('touch',{paths:targets},2500)
      :{status:'INDEX_NOT_READY',state:client?.latest??'UNAVAILABLE'});
   }
  }
  return {status:'UPDATE_ATTEMPTED',results};
 }
 const stop=async()=>{
  const outcomes=await Promise.all([...clients.values()].map(c=>c.stop()));
  const acknowledged=outcomes.every(o=>o.status==='STOPPED'&&o.writerLeaseReleased===true&&o.gracefulExit===true);
  // Recheck even on repeated calls: a cached worker result cannot prove a
  // lease directory has not subsequently reappeared. Never delete it here.
  const leaseAbsent=[...bound.values()].every(item=>indexWriterLeaseAbsent(item.database));
  const confirmed=acknowledged&&leaseAbsent;
  return {status:confirmed?'STOPPED':'UNCONFIRMED',writerLeaseReleased:confirmed,outcomes};
 };
 return {tool:fastTool,search,notifyCompletedWrite,stop,ready,health,snapshot};
}
