import {Worker} from 'node:worker_threads';
import {indexWriterLeaseAbsent} from './index-writer-lock.mjs';

// A graceful stop requires its own acknowledgment, a clean exit, and no lease.
// Exiting (even with code zero) is never a substitute for that acknowledgment.
export function startSelfHealingIndex({root,database,privateState,periodicReconcileMs,fixtureOnly=false}){
 const stopSignal=new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
 const stopFlag=new Int32Array(stopSignal);
 const startedAt=new Date().toISOString();
 let progress=null,lastProgressAt=null,errorCode=null,priorBootLockRecovered=false;
 const safeCode=value=>typeof value==='string'&&/^[A-Z0-9_]{1,80}$/.test(value)?value:'INDEX_WORKER_ERROR';
 const worker=new Worker(new URL('./self-healing-worker.mjs',import.meta.url),{
   workerData:{root,database,privateState,approvedRoot:root,periodicReconcileMs,fixtureOnly,stopSignal}
 });
 let sequence=0,closed=false,faulted=false,latest='INITIALIZING';
 let stopRequested=false,stopAcknowledged=false,stopPromise=null,exitInfo=null,resolveExit;
 const exited=new Promise(resolve=>{resolveExit=resolve});
 const pending=new Map();
 function finishAll(state){
  for(const [id,entry] of pending){
   clearTimeout(entry.timer);pending.delete(id);entry.resolve({status:state});
  }
 }
 worker.on('message',m=>{
  if(m.event){
   if(faulted||closed||stopRequested)return;
   if(m.event==='PRIOR_BOOT_LEASE_RECOVERED')priorBootLockRecovered=true;
   if(m.event==='INDEX_PROGRESS'){
    const p=m.progress??{};
    progress={phase:safeCode(p.phase),elapsedMs:Math.max(0,Number(p.elapsedMs)||0),
      directoriesVisited:Math.max(0,Number(p.directoriesVisited)||0),
      entriesVisited:Math.max(0,Number(p.entriesVisited)||0)};
    lastProgressAt=new Date().toISOString();
   }
   if(m.event==='INITIAL_RECONCILIATION'){
    latest=m.result?.status==='RECONCILED'&&m.result?.state!=='STALE'?'READY':'STALE';
    errorCode=latest==='READY'?null:safeCode(m.result?.code);
   }
   if(m.event==='INITIAL_ERROR'){
    latest=m.fatal===true?'FAILED':'STALE';errorCode=safeCode(m.code);
   }
   if(m.event==='INDEX_DEGRADED'){latest='STALE';errorCode=safeCode(m.code??'INDEX_RECONCILIATION_REQUIRED');}
   if(m.event==='PERIODIC_RECONCILIATION')
     latest=m.result?.status==='RECONCILED'&&m.result?.state!=='STALE'?'READY':'STALE';
   if(m.event==='INDEX_RECOVERED'&&m.result?.status==='RECONCILED'&&m.result?.state!=='STALE'){
    latest='READY';errorCode=null;
   }
   return;
  }
  const entry=pending.get(m.id);if(!entry)return;
  clearTimeout(entry.timer);pending.delete(m.id);
  // Record proof synchronously, before promise callbacks or an exit can run.
  if(entry.op==='stop'&&!faulted&&!m.error&&m.result?.status==='STOPPED'&&m.result?.writerLeaseReleased===true)
   stopAcknowledged=true;
  entry.resolve(m.error?{status:'ERROR',code:m.error}:m.result);
 });
 worker.on('error',error=>{faulted=true;latest='FAILED';errorCode=safeCode(error?.code);finishAll('FAILED')});
 worker.on('exit',code=>{
  closed=true;exitInfo={code};
  if(code!==0||!stopRequested||!stopAcknowledged)faulted=true;
  latest=faulted?'FAILED':'STOPPING';
  // No response arrived for these requests. Never manufacture a STOPPED reply.
  finishAll('FAILED');resolveExit(exitInfo);
 });
 function request(op,fields={},timeoutMs=2500){
  if(closed||faulted)return Promise.resolve({status:'FAILED'});
  return new Promise(resolve=>{
   const id=++sequence;
   const timer=setTimeout(()=>{pending.delete(id);resolve({status:'PENDING',reason:'worker occupied; no unknown operation replay'})},timeoutMs);
   pending.set(id,{op,resolve,timer});
   try{worker.postMessage({...fields,id,op})}
   catch{faulted=true;latest='FAILED';finishAll('FAILED')}
  });
 }
 function call(op,fields={},timeoutMs=2500){
  if(op==='stop')return stop();
  if(stopRequested)return Promise.resolve({status:faulted?'FAILED':'STOPPING'});
  return request(op,fields,timeoutMs);
 }
 async function whenReady(timeoutMs=90000){
  const begin=Date.now();
  while(Date.now()-begin<timeoutMs){
   if(latest==='READY')return {status:'READY'};
   // STALE may be recovering from an unnamed startup notification. Keep the
   // existing bounded wait, without publishing READY before reconciliation.
   if(['FAILED','STOPPED','STOPPING'].includes(latest))return {status:latest};
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  return {status:'PENDING',reason:'worker initialization not confirmed'};
 }
 function stop(){
  // Concurrent/repeated callers observe one attempt, never a replay after timeout.
  if(stopPromise)return stopPromise;
  stopRequested=true;
  // Cooperative cancellation is observable during synchronous directory walks.
  // No thread termination, lease stealing, or fabricated stop acknowledgment.
  Atomics.store(stopFlag,0,1);
  if(!faulted&&!closed)latest='STOPPING';
  stopPromise=(async()=>{
   const unconfirmed=reason=>({status:'UNCONFIRMED',writerLeaseReleased:false,reason});
   if(faulted||closed)return unconfirmed('worker failed or exited before an acknowledged stop');
   const acknowledgment=await request('stop',{},3500);
   if(faulted||!stopAcknowledged||acknowledgment?.status!=='STOPPED'||acknowledgment?.writerLeaseReleased!==true)
    return unconfirmed('graceful writer-stop acknowledgment was not verified');
   let timer;
   const observedExit=exitInfo??await Promise.race([
    exited,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),1500)})
   ]);
   clearTimeout(timer);
   if(faulted||observedExit?.code!==0)return unconfirmed('clean worker exit was not verified');
   if(!indexWriterLeaseAbsent(database)){
    latest='FAILED';return unconfirmed('writer lease remains or its absence cannot be verified');
   }
   latest='STOPPED';
   return {status:'STOPPED',writerLeaseReleased:true,gracefulExit:true};
  })();
  return stopPromise;
 }
 return {call,stop,whenReady,
   snapshot:()=>({state:latest,startedAt,lastProgressAt,errorCode,priorBootLockRecovered,progress:progress?{...progress}:null}),
   ...(fixtureOnly ? {terminateForFixture:()=>worker.terminate()} : {}),
   get latest(){return latest}};
}
