// Single-writer lock for a private DeskSom index. Fail closed after crashes.
// Windows mkdir is atomic; stale locks are NEVER silently broken or stolen.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {threadId} from 'node:worker_threads';

export function acquireIndexWriterLock(database){
  const directory=path.win32.resolve(database)+'.writer-lock';
  const marker=path.win32.join(directory,'owner.json');
  const token=randomUUID();
  try{fs.mkdirSync(directory)}catch(e){
    if(e.code==='EEXIST')throw Object.assign(new Error('INDEX_WRITER_LOCKED: inspect the previous owner and reconcile before restarting'),{code:'INDEX_WRITER_LOCKED'});
    throw e;
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
    directory,
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
