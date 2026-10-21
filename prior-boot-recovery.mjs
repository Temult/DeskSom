// Recover ONLY a fully owned writer lease provably older than this Windows boot.
// The original directory and marker are moved intact into private evidence.
// Never remove an active, same-boot, malformed or ambiguous writer lease.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';

const norm=p=>path.win32.resolve(p).toLowerCase().replace(/\\+$/,'');
const noLink=p=>!fs.lstatSync(p).isSymbolicLink();
const sha=b=>createHash('sha256').update(b).digest('hex');
// Require a positive Windows uptime and a separate 30-second prior-boot gap.
// A 5-minute uptime gate would prevent recovery at the very sign-in boot we need.
const HORIZON_MS=30*1000;
const MIN_BOOT_UPTIME_MS=5000;
function refuse(code){return {status:'REFUSED',code}}
function pidMayExist(pid){
 try{process.kill(pid,0);return true}
 catch(error){return error?.code!=='ESRCH'}
}
function currentClock(){const nowMs=Date.now();return {nowMs,bootTimeMs:nowMs-os.uptime()*1000}}
export function recoverPriorBootIndexLease(database,privateState,clock=currentClock()){
 const {bootTimeMs,nowMs}=clock;
 if(!Number.isFinite(bootTimeMs)||!Number.isFinite(nowMs)||nowMs-bootTimeMs<MIN_BOOT_UPTIME_MS)
  return refuse('BOOT_AGE_NOT_CONFIRMED');
 const privateRoot=path.win32.resolve(privateState),indices=path.win32.join(privateRoot,'indices');
 const db=path.win32.resolve(database),dir=db+'.writer-lock',marker=path.win32.join(dir,'owner.json');
 if(norm(path.win32.dirname(db))!==norm(indices))return refuse('INDEX_NOT_DIRECTLY_PRIVATE');
 try{
  if(!noLink(privateRoot)||!noLink(indices)||!noLink(db)||!noLink(dir)||!noLink(marker))
   return refuse('LINKED_PATH');
  if(!fs.statSync(privateRoot).isDirectory()||!fs.statSync(indices).isDirectory()||!fs.statSync(db).isFile())
   return refuse('INDEX_IDENTITY_UNAVAILABLE');
  const privateReal=fs.realpathSync.native(privateRoot),realDir=fs.realpathSync.native(path.win32.dirname(db));
  if(norm(path.win32.join(privateReal,'indices'))!==norm(realDir))
   return refuse('INDEX_DIRECTORY_CHANGED');
  const children=fs.readdirSync(dir);
  if(children.length!==1||children[0]!=='owner.json')return refuse('LOCK_HAS_UNKNOWN_CONTENT');
  const before=fs.readFileSync(marker);
  if(before.length>1024)return refuse('MARKER_TOO_LARGE');
  let owner;try{owner=JSON.parse(before.toString('utf8'))}catch{return refuse('INVALID_MARKER')}
  if(owner?.schema!=='desksom.index-writer/v1'||!Number.isSafeInteger(owner.pid)||
   owner.pid<1||owner.pid===process.pid||!Number.isSafeInteger(owner.threadId)||
   typeof owner.token!=='string'||!/^[0-9a-f-]{36}$/i.test(owner.token)||
   typeof owner.startedUtc!=='string')return refuse('FOREIGN_OR_AMBIGUOUS_OWNER');
  // Never take a writer lease when the recorded PID still exists, even if the
  // wall clock jumped after startup or Windows has reused the old PID.
  if(pidMayExist(owner.pid))return refuse('RECORDED_OWNER_PID_MAY_BE_ALIVE');
  const startedMs=Date.parse(owner.startedUtc);
  if(!Number.isFinite(startedMs))return refuse('INVALID_START_TIME');
  const cutoff=bootTimeMs-HORIZON_MS;
  const lockStats=fs.lstatSync(dir),markerStats=fs.lstatSync(marker);
  if(startedMs>=cutoff||lockStats.birthtimeMs>=cutoff||markerStats.birthtimeMs>=cutoff||
    markerStats.mtimeMs>=cutoff||startedMs>nowMs)return refuse('LEASE_NOT_PROVEN_PRIOR_BOOT');
  const oldHash=sha(before);
  const evidenceParent=path.win32.join(privateRoot,'owner-repairs');
  // The owner-only private state DACL is inherited; never redirect through a link.
  if(fs.existsSync(evidenceParent)&&!noLink(evidenceParent))return refuse('EVIDENCE_LINKED');
  const folder=path.win32.join(evidenceParent,'auto-prior-boot-'+randomUUID());
  const destination=path.win32.join(folder,path.win32.basename(dir));
  const intent={schema:'desksom.prior-boot-writer-recovery/v1',
    databaseBasename:path.win32.basename(db),markerSha256:oldHash,
    priorPid:owner.pid,startedUtc:owner.startedUtc,bootTimeMs,at:new Date(nowMs).toISOString(),
    action:'same-volume evidence-preserving move; no deletion or database replacement'};
  try{
   fs.mkdirSync(folder,{recursive:true});
   fs.writeFileSync(path.win32.join(folder,'RECOVERY_INTENT.json'),JSON.stringify(intent)+'\n',{flag:'wx'});
   if(fs.existsSync(destination))return refuse('EVIDENCE_COLLISION');
   // Avoid a mutation after a changed owner record, including same-boot races.
   if(pidMayExist(owner.pid)||sha(fs.readFileSync(marker))!==oldHash||fs.readdirSync(dir).length!==1)
    return refuse('MARKER_CHANGED_BEFORE_MOVE');
   fs.renameSync(dir,destination);
   if(fs.existsSync(dir)||sha(fs.readFileSync(path.win32.join(destination,'owner.json')))!==oldHash)
    return refuse('MOVE_UNCONFIRMED');
   fs.writeFileSync(path.win32.join(folder,'RECOVERY_RESULT.json'),
    JSON.stringify({schema:intent.schema,status:'PRIOR_BOOT_LOCK_QUARANTINED',
      markerSha256:oldHash,databaseBasename:path.win32.basename(db),
      at:new Date(nowMs).toISOString(),originalDatabasePreserved:true})+'\n',{flag:'wx'});
   return {status:'RECOVERED',code:'PRIOR_BOOT_LOCK_QUARANTINED'};
  }catch{return refuse('EVIDENCE_MOVE_UNCERTAIN')}
 }catch(error){return refuse(error?.code==='ENOENT'?'LEASE_OR_DATABASE_NOT_FOUND':'INSPECTION_FAILED')}
}
