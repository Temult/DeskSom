// Owner-approved opt-in to native filename indexing. No silent service restart.
import fs from 'node:fs/promises';
import path from 'node:path';
import {makeIndexFeatureProfile,profileToBrokerSettings} from './index-profile.mjs';
import {loadOwned,readState,settings,taskDefinition,taskMatches,identityMatches,startOwned,phaseAfterVerifiedStart} from './install-core.mjs';
import {fail,readJson,atomicJson,canonical,envelope,now,assertNoLinks} from './common.mjs';

export function checkIndexNode(version=process.versions.node){
 const parts=String(version).split('.').map(Number);
 if(parts.length!==3||parts.some(n=>!Number.isInteger(n))||parts[0]<25)
  fail('INDEX_NODE_UNSUPPORTED','Indexed search currently requires Node.js 25 or newer. Ordinary DeskSom remains supported without it.',
    'Disable indexing or update Node through a separate owner-approved installation.',10);
}
export async function listIndex(sourceRoot,stateRoot,platform,{load=loadOwned}={}){
 let state;
 try{state=await load(sourceRoot,stateRoot,platform)}
 catch(e){
  // Interrupted changes are visible, but not automatically resumed.
  const actual=await readState(stateRoot);
  if(!actual?.pendingIndexChange)throw e;
  return envelope('index',{status:'INDEX_CHANGE_INTERRUPTED',pendingPhase:actual.pendingIndexChange.phase,
   installationId:actual.installationId,needsManualRecovery:true,
   nextAction:'Inspect task and configuration state. Use guarded index rollback; never blindly repeat apply.'});
 }
 const observed=typeof platform.probe==='function'?await platform.probe(state):null;
 const runtime=identityMatches(observed,state)?observed?.indexStatus??null:null;
 return envelope('index',{status:'INDEX_LISTED',runtime,installed:!!state.completed?.local_task,
   enabled:state.indexProfile?.enabled===true,
   roots:state.indexProfile?.indices?.map(x=>x.root)??[],
   periodicMinutes:(state.indexProfile?.periodicReconcileMs??1800000)/60000,
   allowedDirectories:state.activeAllowedDirectories??state.plan.allowedDirectories,
   rootsRevision:state.rootsRevision??0,installationId:state.installationId,
   changesRequireRestart:true,existingIndexDataPreservedOnDisable:true});
}
export async function planIndex(sourceRoot,stateRoot,request,platform,{load=loadOwned}={}){
 const state=await load(sourceRoot,stateRoot,platform);
 if(state.pendingIndexChange)fail('INDEX_CHANGE_INTERRUPTED','Reconcile the prior attempt before planning another change.');
 if(!state.completed?.local_task)fail('INDEX_NOT_INSTALLED','Install DeskSom first.');
 const profile=makeIndexFeatureProfile(state,request);
 if(profile.enabled)checkIndexNode();
 if(state.indexProfile&&canonical(state.indexProfile)===canonical(profile))fail('INDEX_NO_CHANGE','Selected index configuration is already active.');
 if(!state.indexProfile&&!profile.enabled)fail('INDEX_ALREADY_DISABLED','Indexing is already disabled.');
 return envelope('index',{status:'INDEX_PLAN_READY',proposal:profile,previousEnabled:state.indexProfile?.enabled===true,
   action:'Review the exact roots, timer and restart before applying with this digest.',
   changesRequireRestart:true,credentialsUnchanged:true});
}
// A broker with a temporarily STALE filename watcher can still be the exact
// authenticated owner. For STOP admission use identity+boot+idleness; the
// broker's authenticated quiesce endpoint supplies the decisive writer proof.
function ownerIdleForQuiesce(local,state){
 return local && typeof local.ready==='boolean' &&
  local.host===state.plan.binding.host &&
  local.instance===state.plan.instance &&
  local.version===state.plan.version &&
  local.installationId===state.installationId &&
  local.sourceFingerprint===state.plan.sourceFingerprint &&
  typeof local.bootId==='string' &&
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(local.bootId) &&
  local.activeCalls===0;
}
async function tasksForIndex(state,platform,wasStopped){
 const kinds=['local',...(state.credentialsConfigured?['tunnel']:[])];
 for(const kind of kinds){
  const t=await platform.taskGet(state.plan.tasks[kind]);
  if(!t||!taskMatches(t,taskDefinition(state.plan,state,kind)))
   fail('INDEX_TASK_DRIFT','The scheduled task differs from the bound installation. No changes were made.',undefined,22);
  if(!wasStopped&&(!t.enabled||!['Running','Queued'].includes(t.state)))
   fail('INDEX_SERVICE_NOT_RUNNING','Stop or repair the existing service before changing indexing.',undefined,23);
 }
 const local=await platform.probe(state);
 if(!wasStopped&&!ownerIdleForQuiesce(local,state))
  fail('INDEX_LOCAL_NOT_QUIET','Verify the expected local broker has no active work before changing indexing.',undefined,23);
 if(wasStopped){
  const owned=await platform.runtimeProcesses(state);
  if(owned.count || await platform.portOwner(state.plan.port))
   fail('INDEX_STOPPED_BUT_BUSY','Stopped installation has running processes or its port is occupied.',undefined,23);
 }
 return kinds;
}
export async function applyIndex(sourceRoot,stateRoot,proposal,approve,confirmed,platform,{load=loadOwned,save=atomicJson}={}){
 if(!confirmed||!approve||approve!==proposal?.approvalSha256)
  fail('INDEX_APPROVAL_REQUIRED','Exact proposal hash and restart confirmation required.',undefined,10);
 const lease=await platform.lock(stateRoot);
 try{
  const state=await load(sourceRoot,stateRoot,platform);
  if(state.pendingIndexChange)fail('INDEX_CHANGE_INTERRUPTED','Prior index change must be recovered first.',undefined,25);
  const next=makeIndexFeatureProfile(state,{enabled:proposal.enabled,roots:proposal.indices.map(x=>x.root),
    periodicMinutes:proposal.periodicReconcileMs/60000});
  if(canonical(next)!==canonical(proposal))fail('INDEX_PLAN_STALE','Approved index plan is stale or modified.',undefined,21);
  if(next.enabled)checkIndexNode();
  const existingSettings=await readJson(path.join(stateRoot,'settings.json'));
  if(canonical(existingSettings)!==canonical(await settings(state)))fail('INDEX_SETTINGS_DRIFT','Current settings have changed.',undefined,21);
  const wasStopped=!!state.operatorStopped;
  let observedAfterStart=null;
  const kinds=await tasksForIndex(state,platform,wasStopped);
  // Durable intent precedes even private directory/ACL changes.
  state.pendingIndexChange={schema:'desksom.index-change-intent/v1',approvalSha256:next.approvalSha256,
    installationId:state.installationId,rootsRevision:state.rootsRevision??0,
    previous:state.indexProfile??null,next,wasStopped,phase:'INTENT',at:now()};
  state.operatorStopped=true;
  await save(path.join(stateRoot,'install.json'),state);
  if(next.enabled){
   const privateIndexDir=path.join(stateRoot,'indices');
   await assertNoLinks(privateIndexDir);
   await platform.protectDirectory(privateIndexDir);
   await assertNoLinks(privateIndexDir);
  }
  // Quiesce the local broker and release the index writer BEFORE stopping the
  // tunnel. A rejected quiesce must not unnecessarily break ChatGPT polling.
  if(!wasStopped)for(const kind of kinds)await platform.stopService(state,kind);
  if((await platform.runtimeProcesses(state)).count || await platform.portOwner(state.plan.port))
   fail('INDEX_STOP_UNCONFIRMED','Service may still be running. Inspect before rollback or further work.',undefined,25);
  state.pendingIndexChange.phase='SERVICES_STOPPED';await save(path.join(stateRoot,'install.json'),state);
  state.indexProfile=next;
  await save(path.join(stateRoot,'settings.json'),await settings(state));
  state.pendingIndexChange.phase='CONFIG_WRITTEN';await save(path.join(stateRoot,'install.json'),state);
  if(!wasStopped){
   state.operatorStopped=false;
   await save(path.join(stateRoot,'install.json'),state);
   for(const kind of kinds){
    const taskName=state.plan.tasks[kind];
    const expected=taskDefinition(state.plan,state,kind);
    const stoppedTask=await platform.taskGet(taskName);
    if(!stoppedTask||!taskMatches(stoppedTask,expected))
     fail('INDEX_RESTART_TASK_DRIFT','The owned task changed during the guarded restart.',undefined,25);
    // Preflight proved this task was owner-enabled. Our own stop helper disables it
    // to prevent an unattended relaunch, so deliberately restore that original state.
    // Never enable an unknown or changed task, or an initially owner-disabled task.
    if(!stoppedTask.enabled){
     await platform.taskEnable(taskName);
     const restored=await platform.taskGet(taskName);
     if(!restored||!taskMatches(restored,expected)||!restored.enabled)
      fail('INDEX_REENABLE_UNCONFIRMED','The owned task could not be verified after re-enable.',undefined,25);
    }
    await startOwned(state,kind,platform);
   }
   const probe=await platform.probe(state);
   if(!identityMatches(probe,state))fail('INDEX_RESTART_UNCERTAIN','Restarted broker identity cannot be verified.',undefined,25);
   observedAfterStart=probe;
  }
  state.phase=wasStopped?'STOPPED':phaseAfterVerifiedStart(state);
  state.pendingIndexChange=null;
  await save(path.join(stateRoot,'install.json'),state);
  return envelope('index',{status:wasStopped?'INDEX_UPDATED_STOPPED':'INDEX_UPDATED',
    enabled:next.enabled,roots:next.indices.map(x=>x.root),periodicMinutes:next.periodicReconcileMs/60000,
    previouslyStopped:wasStopped,installationId:state.installationId,
    indexReady:wasStopped?null:!next.enabled||observedAfterStart?.indexWorkerReady===true,
    indexStatus:observedAfterStart?.indexStatus??null,
    nextAction:wasStopped?'Start the owner-stopped service deliberately.':
      'Settings saved. Core tools are ready; selected indices may still be building or need attention. Read indexStatus before using fast search.'});
 }finally{await lease.release()}
}
// Recovery is deliberately limited to an interrupted attempt with already stopped tasks.
// It never automatically retries a write, stops a live unknown process, or restarts services.
export async function rollbackIndex(stateRoot,confirmed,platform,{save=atomicJson}={}){
 if(!confirmed)fail('INDEX_ROLLBACK_APPROVAL_REQUIRED','Explicit rollback confirmation required.',undefined,10);
 const lease=await platform.lock(stateRoot);
 try{
  const state=await readState(stateRoot);
  if(!state?.pendingIndexChange || state.pendingIndexChange.schema!=='desksom.index-change-intent/v1')
   fail('INDEX_NO_PENDING_ROLLBACK','No interrupted index change found.',undefined,10);
  const pending=state.pendingIndexChange;
  if(pending.installationId!==state.installationId||pending.rootsRevision!==(state.rootsRevision??0))
   fail('INDEX_ROLLBACK_IDENTITY_DRIFT','The installation or file roots changed.',undefined,25);
  const host=await platform.environment();
  if(host.host!==state.plan.binding.host||host.sid!==state.plan.binding.sid)
   fail('INDEX_ROLLBACK_HOST_DRIFT','The installed user/host identity differs.',undefined,25);
  const running=[];
  for(const kind of ['local',...(state.credentialsConfigured?['tunnel']:[])]){
   const task=await platform.taskGet(state.plan.tasks[kind]);
   if(!taskMatches(task,taskDefinition(state.plan,state,kind)))
    fail('INDEX_ROLLBACK_TASK_DRIFT','Rollback requires matching owned task identities.',undefined,25);
   if(['Running','Queued'].includes(task.state))running.push(kind);
  }
  if(running.length){
   // This is a NEW explicitly approved rollback, not a retry of an ambiguous apply.
   // Check the live identity and active tool calls before stopping observed running tasks.
   const observed=await platform.probe(state);
   if(!identityMatches(observed,state)||observed.activeCalls>0)
    fail('INDEX_ROLLBACK_SERVICE_BUSY','Cannot stop an unverified or busy service for rollback.',undefined,25);
   for(const kind of ['tunnel','local'])if(running.includes(kind))await platform.stopService(state,kind);
  }
  if((await platform.runtimeProcesses(state)).count||await platform.portOwner(state.plan.port))
   fail('INDEX_ROLLBACK_BUSY','Rollback requires zero owned runtime processes and a free local port.',undefined,25);
  // Compare the current file against the two exact possible phases. Unknown drift fails closed.
  const actual=await readJson(path.join(stateRoot,'settings.json'));
  const previous={...state};if(pending.previous)previous.indexProfile=pending.previous;else delete previous.indexProfile;
  const previousSettings=await settings(previous);
  const next={...state,indexProfile:pending.next};
  const nextSettings=await settings(next);
  if(canonical(actual)!==canonical(previousSettings)&&canonical(actual)!==canonical(nextSettings))
   fail('INDEX_ROLLBACK_SETTINGS_DRIFT','Private settings do not match either approved state.',undefined,25);
  state.pendingIndexChange.phase='ROLLBACK_INTENT';
  state.operatorStopped=true;
  await save(path.join(stateRoot,'install.json'),state);
  await save(path.join(stateRoot,'settings.json'),previousSettings);
  if(pending.previous)state.indexProfile=pending.previous;else delete state.indexProfile;
  state.phase='STOPPED';
  state.pendingIndexChange=null;
  await save(path.join(stateRoot,'install.json'),state);
  return envelope('index',{status:'INDEX_ROLLED_BACK_STOPPED',installationId:state.installationId,
    serviceStarted:false,privateIndexDataRetained:true,
    nextAction:'Inspect configuration and owner-start services separately. The rollback never replays an interrupted start.'});
 }finally{await lease.release()}
}
