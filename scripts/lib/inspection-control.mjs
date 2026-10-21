// Owner-approved inspection controls. Only the owned local broker restarts.
import path from 'node:path';
import {resolveTrustedGit} from '../../project-inspect.mjs';
import {loadOwned,settings,taskDefinition,taskMatches,identityMatches,startOwned,phaseAfterVerifiedStart} from './install-core.mjs';
import {fail,keysOnly,hashObject,hashFile,canonical,readJson,atomicJson,envelope,now,insideWin} from './common.mjs';
const current=s=>({enabled:s.projectInspectEnabled===true,gitExecutable:s.projectInspectGitExecutable??null,revision:s.inspectionRevision??0});
const applyValue=(s,v)=>{s.projectInspectEnabled=v.enabled;s.inspectionRevision=v.revision;if(v.gitExecutable)s.projectInspectGitExecutable=v.gitExecutable;else delete s.projectInspectGitExecutable;return s};
const idle=(p,s)=>identityMatches(p,s)&&p.activeCalls===0&&typeof p.bootId==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(p.bootId);
const localTask=async(s,p)=>{const t=await p.taskGet(s.plan.tasks.local);if(!taskMatches(t,taskDefinition(s.plan,s,'local')))fail('INSPECTION_TASK_DRIFT','The local task no longer matches this installation.',undefined,22);return t};
async function assertNoLocalProcess(s,p){if((await p.runtimeProcesses(s,'local')).count||await p.portOwner(s.plan.port))fail('INSPECTION_LOCAL_BUSY','The owned local broker has not stopped or its port is occupied.',undefined,25)}
async function makeProposal(s,request){
 keysOnly(request,['enabled'],'project inspection request');
 if(typeof request.enabled!=='boolean')fail('INSPECTION_BOOLEAN_REQUIRED','enabled must be a boolean.');
 if(!s.completed?.local_task||s.phase==='TASKS_REMOVED')fail('INSPECTION_NOT_INSTALLED','Install the local service first.',undefined,10);
 const before=current(s);
 if(before.enabled===request.enabled)fail('INSPECTION_NO_CHANGE','This inspection setting is already selected.',undefined,10);
 let gitExecutable=before.gitExecutable,gitSha256=null;
 if(request.enabled){
  gitExecutable=await resolveTrustedGit(gitExecutable??undefined);
  if((s.activeAllowedDirectories??s.plan.allowedDirectories).some(root=>insideWin(gitExecutable,root)))
   fail('INSPECTION_GIT_INSIDE_WORK_FOLDER','Use a separately installed Git executable, not one inside a project folder.');
  gitSha256=await hashFile(gitExecutable);
 }
 const body={schema:'desksom.inspection-change/v1',installationId:s.installationId,planSha256:s.planSha256,
  sourceFingerprint:s.plan.sourceFingerprint,rootsRevision:s.rootsRevision??0,
  indexProfileSha256:hashObject(s.indexProfile??null),previous:before,
  next:{enabled:request.enabled,gitExecutable,revision:before.revision+1},gitSha256,
  localRestartRequired:true,tunnelUnchanged:true,fileRootsUnchanged:true};
 return {...body,approvalSha256:hashObject(body)};
}
export async function listInspection(source,stateRoot,platform,{load=loadOwned}={}){
 const s=await load(source,stateRoot,platform,false,{inspectionRecovery:true});
 if(s.pendingInspectionChange)return envelope('inspection',{status:'INSPECTION_CHANGE_INTERRUPTED',
  pendingPhase:s.pendingInspectionChange.phase,installationId:s.installationId,needsManualRecovery:true,
  nextAction:'Read the pending receipt; use explicit guarded rollback, never replay Apply.'});
 const observed=await platform.probe(s);
 return envelope('inspection',{status:'INSPECTION_LISTED',...current(s),runtime:identityMatches(observed,s)?observed.projectInspection??null:null,
  installationId:s.installationId,localRestartRequired:true,tunnelUnchanged:true});
}
export async function planInspection(source,stateRoot,request,platform,{load=loadOwned}={}){
 const s=await load(source,stateRoot,platform);
 if(s.pendingInspectionChange)fail('INSPECTION_CHANGE_INTERRUPTED','Recover the prior inspection change first.',undefined,25);
 return envelope('inspection',{status:'INSPECTION_PLAN_READY',proposal:await makeProposal(s,request),
  nextAction:'Review this inspection setting and local restart, then approve the exact digest.'});
}
export async function applyInspection(source,stateRoot,proposal,approve,confirmed,platform,{load=loadOwned,save=atomicJson}={}){
 if(!confirmed||!approve||approve!==proposal?.approvalSha256)fail('INSPECTION_APPROVAL_REQUIRED','Exact proposal approval and local restart confirmation are required.',undefined,10);
 const lock=await platform.lock(stateRoot);
 try{
  const s=await load(source,stateRoot,platform);
  if(s.pendingInspectionChange)fail('INSPECTION_CHANGE_INTERRUPTED','Recover the prior inspection change first.',undefined,25);
  const fresh=await makeProposal(s,{enabled:proposal.next?.enabled});
  if(canonical(fresh)!==canonical(proposal))fail('INSPECTION_PLAN_STALE','Installation, roots, indexing, Git or inspection state changed since approval.',undefined,21);
  if(canonical(await readJson(path.join(stateRoot,'settings.json')))!==canonical(await settings(s)))fail('INSPECTION_SETTINGS_DRIFT','Broker settings do not match installed state.',undefined,21);
  const stopped=!!s.operatorStopped,t=await localTask(s,platform),observed=await platform.probe(s);
  if(stopped){if(['Running','Queued'].includes(t.state))fail('INSPECTION_LOCAL_BUSY','Owner-stopped local task is still active.');await assertNoLocalProcess(s,platform)}
  else if(!t.enabled||!['Running','Queued'].includes(t.state)||!idle(observed,s))fail('INSPECTION_LOCAL_NOT_QUIET','An enabled, verified idle local broker is required.',undefined,23);
  s.pendingInspectionChange={schema:'desksom.inspection-intent/v1',proposal,previouslyStopped:stopped,phase:'INTENT',at:now()};
  s.operatorStopped=true;await save(path.join(stateRoot,'install.json'),s);
  if(!stopped)await platform.stopService(s,'local');
  await assertNoLocalProcess(s,platform);
  s.pendingInspectionChange.phase='SERVICES_STOPPED';await save(path.join(stateRoot,'install.json'),s);
  const next=applyValue({...s},proposal.next);
  await save(path.join(stateRoot,'settings.json'),await settings(next));
  applyValue(s,proposal.next);s.pendingInspectionChange.phase='CONFIG_WRITTEN';await save(path.join(stateRoot,'install.json'),s);
  if(!stopped){
   let owned=await localTask(s,platform);
   if(!owned.enabled){await platform.taskEnable(s.plan.tasks.local);owned=await localTask(s,platform);if(!owned.enabled)fail('INSPECTION_ENABLE_UNCONFIRMED','Local task re-enable was not confirmed.',undefined,25)}
   s.operatorStopped=false;s.pendingInspectionChange.phase='START_AUTHORIZED';await save(path.join(stateRoot,'install.json'),s);
   const after=await startOwned(s,'local',platform);
   if(!identityMatches(after,s)||after.projectInspection?.enabled!==proposal.next.enabled||after.projectInspection?.revision!==proposal.next.revision||
    (proposal.next.enabled&&after.projectInspection?.ready!==true))fail('INSPECTION_RESTART_UNCERTAIN','The restarted broker did not confirm the approved inspection setting.',undefined,25);
  }
  s.pendingInspectionChange=null;s.phase=stopped?'STOPPED':phaseAfterVerifiedStart(s);await save(path.join(stateRoot,'install.json'),s);
  return envelope('inspection',{status:stopped?'INSPECTION_UPDATED_STOPPED':'INSPECTION_UPDATED',...current(s),previouslyStopped:stopped,tunnelUnchanged:true,
   nextAction:'Refresh the existing ChatGPT connection metadata and verify tools in a new chat. The server cannot prove client visibility.'});
 }finally{await lock.release()}
}
export async function rollbackInspection(source,stateRoot,confirmed,platform,{load=loadOwned,save=atomicJson}={}){
 if(!confirmed)fail('INSPECTION_ROLLBACK_APPROVAL_REQUIRED','Explicit rollback approval is required.',undefined,10);
 const lock=await platform.lock(stateRoot);
 try{
  // Recovery still verifies host, source, dependencies and the exact before/after settings.
  const s=await load(source,stateRoot,platform,false,{inspectionRecovery:true}),pending=s.pendingInspectionChange;
  if(!pending||pending.schema!=='desksom.inspection-intent/v1')fail('INSPECTION_NO_PENDING_CHANGE','No pending inspection change exists.',undefined,10);
  const p=pending.proposal,{approvalSha256,...body}=p;
  if(hashObject(body)!==approvalSha256||p.installationId!==s.installationId||p.planSha256!==s.planSha256||p.sourceFingerprint!==s.plan.sourceFingerprint||
    p.rootsRevision!==(s.rootsRevision??0)||p.indexProfileSha256!==hashObject(s.indexProfile??null))fail('INSPECTION_RECOVERY_DRIFT','The pending inspection receipt no longer matches the installation.',undefined,21);
  const before=applyValue({...s},p.previous),after=applyValue({...s},p.next),actual=await readJson(path.join(stateRoot,'settings.json'));
  if(![await settings(before),await settings(after)].some(v=>canonical(v)===canonical(actual)))fail('INSPECTION_RECOVERY_SETTINGS_DRIFT','Settings match neither approved side of this change.',undefined,21);
  const task=await localTask(s,platform);
  if(['Running','Queued'].includes(task.state)){
   if(!idle(await platform.probe(s),s))fail('INSPECTION_RECOVERY_BUSY','The current local broker is not verified idle.',undefined,23);
   await platform.stopService(s,'local');
  }
  await assertNoLocalProcess(s,platform);
  s.operatorStopped=true;s.pendingInspectionChange.phase='ROLLBACK_INTENT';await save(path.join(stateRoot,'install.json'),s);
  await save(path.join(stateRoot,'settings.json'),await settings(before));applyValue(s,p.previous);
  s.phase='STOPPED';s.pendingInspectionChange=null;await save(path.join(stateRoot,'install.json'),s);
  return envelope('inspection',{status:'INSPECTION_ROLLED_BACK_STOPPED',...current(s),serviceStarted:false,tunnelUnchanged:true,
   nextAction:'Review the restored state and explicitly start the local service. No operation was replayed.'});
 }finally{await lock.release()}
}
