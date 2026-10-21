// Single-writer lock for a private DeskSom index. The owner from the same
// Windows boot remains protected. A conclusively prior-boot lease may be moved
// intact to private evidence before obtaining a NEW atomic writer lease.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {threadId} from 'node:worker_threads';
import {recoverPriorBootIndexLease} from './prior-boot-recovery.mjs';

export function acquireIndexWriterLock(database,{privateState=null}={}){
  const directory=path.win32.resolve(database)+'.writer-lock';
  const marker=path.win32.join(directory,'owner.json');
  const token=randomUUID();
  let recoveredPriorBoot=false;
  try{fs.mkdirSync(directory)}catch(e){
    if(e.code!=='EEXIST')throw e;
    // Old-boot recovery is allowed only after the protected directory,
    // marker, timestamps and original database pass the independent proof.
    const result=privateState?recoverPriorBootIndexLease(database,privateState):{status:'REFUSED'};
    if(result.status!=='RECOVERED')throw Object.assign(
      new Error('INDEX_WRITER_LOCKED: '+(result.code??'manual review required')),
      {code:'INDEX_WRITER_LOCKED'});
    // A new writer must still win atomic mkdir. No lock is silently adopted.
    fs.mkdirSync(directory);
    recoveredPriorBoot=true;
  }
  try{
    fs.writeFileSync(marker,JSON.stringify({schema:'desksom.index-writer/v1',pid:process.pid,threadId,token,startedUtc:new Date().toISOString()})+'\n',{flag:'wx',mode:0o600});
  }catch(e){
    // Only a newly created empty folder can be cleaned up after failed creation.
    try{fs.rmdirSync(directory)}catch{}
    throw e;
  }
  let released=false;
  return {
    directory,recoveredPriorBoot,
    release(){
      if(released)return;
      const record=JSON.parse(fs.readFileSync(marker,'utf8'));
      if(record.token!==token||record.pid!==process.pid||record.threadId!==threadId)
        throw Object.assign(new Error('INDEX_WRITER_LOCK_OWNER_CHANGED'),{code:'INDEX_WRITER_LOCK_OWNER_CHANGED'});
      fs.unlinkSync(marker);
      fs.rmdirSync(directory); // unexpected children must block release
      released=true;
    }
  };
}

// Read-only proof: permission errors and existing/dangling entries are not absence.
// This helper never removes a lock, including one left by a crashed worker.
export function indexWriterLeaseAbsent(database){
  try{fs.lstatSync(path.win32.resolve(database)+'.writer-lock');return false}
  catch(error){return error?.code==='ENOENT'}
}
