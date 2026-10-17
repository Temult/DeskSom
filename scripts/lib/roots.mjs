import fs from 'node:fs/promises';
import path from 'node:path';
import {hashObject,canonical,keysOnly,fail,normalizeWin,assertNoLinks,atomicJson,readJson,envelope} from './common.mjs';
import {makePlan,loadOwned,readState,effectiveRoots,rootsRevision,taskDefinition,taskMatches,startOwned,settings,phaseAfterVerifiedStart,identityMatches} from './install-core.mjs';

const ROOTS_SCHEMA='desksom.roots-change/v1';
export function makeRootsChange(state,request) {
  if (!request || typeof request!=='object' || Array.isArray(request)) fail('ROOTS_REQUEST_INVALID','Provide a JSON object with addDirectories and/or removeDirectories.',undefined,20);
  keysOnly(request,['addDirectories','removeDirectories'],'folder change request');
  const add=request.addDirectories??[],remove=request.removeDirectories??[];
  if (!Array.isArray(add)||!Array.isArray(remove)||(!add.length&&!remove.length))
    fail('ROOTS_REQUEST_INVALID','Specify at least one folder to add or remove.',undefined,20);
  if (add.some(x=>typeof x!=='string')||remove.some(x=>typeof x!=='string'))
    fail('ROOTS_REQUEST_INVALID','Folder paths must be strings.',undefined,20);
  const added=[...new Set(add.map(normalizeWin).map(x=>x.toLowerCase()))].sort();
  const removed=[...new Set(remove.map(normalizeWin).map(x=>x.toLowerCase()))].sort();
  if([...added,...removed].some(x=>x.length<4))
    fail('SENSITIVE_ROOT','Whole drives cannot be exposed as a file-tool folder.',undefined,20);
  const current=effectiveRoots(state);
  for(const r of added) if(current.includes(r)) fail('ROOT_ALREADY_ALLOWED','This folder is already in the allowed list.',undefined,10);
  for(const r of removed) if(!current.includes(r)) fail('ROOT_NOT_ALLOWED','This folder is not in the allowed list.',undefined,10);
  for(const r of added) if(removed.includes(r)) fail('ROOT_CONFLICT','A folder cannot be added and removed in one change.',undefined,20);
  const next=[...new Set([...current.filter(x=>!removed.includes(x)),...added])].sort();
  if (!next.length||next.length>20) fail('ROOTS_REQUIRED','Keep between 1 and 20 allowed folders.',undefined,20);
  const proposal={schemaVersion:ROOTS_SCHEMA,installationId:state.installationId,planSha256:state.planSha256,
    currentRevision:rootsRevision(state),currentDirectories:current,nextDirectories:next,
    addDirectories:added,removeDirectories:removed,requiresServiceRestart:true,
    terminalPermissionsUnchanged:true};
  return {...proposal,approvalSha256:hashObject(proposal)};
}
async function validateNext(state,next,platform) {
  const env=await platform.environment();
  makePlan(state.plan.sourceRoot,{instance:state.plan.instance,installRoot:state.plan.installRoot,
    stateRoot:state.plan.stateRoot,allowedDirectories:next,port:state.plan.port},
    env,{fingerprint:state.plan.sourceFingerprint,manifest:{version:state.plan.version}});
  for(const dir of next){
    await assertNoLinks(dir);
    const st=await fs.stat(dir).catch(()=>null);
    if(!st?.isDirectory()) fail('ROOT_NOT_FOUND','One proposed allowed folder does not exist.', 'Choose an existing folder or create it explicitly before planning.',20);
  }
}
export async function listRoots(sourceRoot,stateRoot,platform) {
  const state=await loadOwned(sourceRoot,stateRoot,platform);
  return envelope('folders',{status:'ROOTS_LISTED',directories:effectiveRoots(state),revision:rootsRevision(state),
    installationId:state.installationId,requiresRestartForChanges:true,
    shell:'FULL_WINDOWS_USER_PERMISSIONS_NOT_A_SANDBOX'});
}
export async function planRoots(sourceRoot,stateRoot,request,platform){
  const state=await loadOwned(sourceRoot,stateRoot,platform);
  const proposal=makeRootsChange(state,request);
  await validateNext(state,proposal.nextDirectories,platform);
  return envelope('folders',{status:'ROOTS_PLAN_READY',proposal,
    nextAction:'Review the exact folder list, then apply with its SHA-256 and explicit permission to restart the owned services.'});
}
export async function applyRoots(sourceRoot,stateRoot,proposal,approve,confirmed,platform) {
  if(!confirmed || !approve || approve!==proposal?.approvalSha256)
    fail('ROOTS_APPROVAL_REQUIRED','The reviewed SHA-256 and service-restart confirmation are required.',undefined,10);
  const {approvalSha256,...body}=proposal;
  if(proposal.schemaVersion!==ROOTS_SCHEMA||hashObject(body)!==approvalSha256)
    fail('ROOTS_PLAN_CHANGED','The folder-change plan failed its integrity check.',undefined,21);
  const lease=await platform.lock(stateRoot);
  try {
    let state=await loadOwned(sourceRoot,stateRoot,platform);
    const next=makeRootsChange(state,{addDirectories:proposal.addDirectories,removeDirectories:proposal.removeDirectories});
    if(canonical(next)!==canonical(proposal))
      fail('ROOTS_PLAN_STALE','Installed folder policy changed since approval.', 'Create and approve a new proposal.',21);
    await validateNext(state,next.nextDirectories,platform);
    if(!state.completed?.local_task||state.phase==='TASKS_REMOVED')
      fail('LOCAL_NOT_INSTALLED','Folder changes require an installed DeskSom service.',undefined,10);
    const wasStopped=!!state.operatorStopped, kinds=['local',...(state.credentialsConfigured?['tunnel']:[])];
    for(const kind of kinds){
      const t=await platform.taskGet(state.plan.tasks[kind]);
      if(!taskMatches(t,taskDefinition(state.plan,state,kind)))
        fail('TASK_DRIFT','A service task does not match this owned installation.',undefined,22);
    }
    const probe=await platform.probe(state);
    if(!wasStopped && !identityMatches(probe,state))
      fail('LOCAL_NOT_READY','Do not change live roots while the expected broker is unreachable.', 'Inspect the existing service first.',10);
    if(!wasStopped && probe.activeCalls>0)
      fail('ACTIVE_CALLS','The broker has active tool calls. Do not interrupt them.', 'Wait for a quiet service and create a new approved attempt.',23);
    if(wasStopped && ((await platform.runtimeProcesses(state)).count || await platform.portOwner(state.plan.port)))
      fail('RUNTIME_BUSY','The owner-stopped installation still has live processes.',undefined,23);
    const configPath=path.join(state.plan.stateRoot,'dc','config.json');
    const config=await readJson(configPath);
    if(canonical(config.allowedDirectories)!==canonical(effectiveRoots(state)))
      fail('ROOTS_CONFIG_DRIFT','The Desktop Commander configuration differs from the installed root policy.',undefined,21);
    // Intent is durable before any service or config changes; startup refuses pending updates.
    state.pendingRootsChange={schemaVersion:ROOTS_SCHEMA,approvalSha256,fromRevision:rootsRevision(state),
      previous:effectiveRoots(state),next:next.nextDirectories,phase:'INTENT',at:new Date().toISOString()};
    state.operatorStopped=true;
    await atomicJson(path.join(state.plan.stateRoot,'install.json'),state);
    if(!wasStopped)for(const kind of [...kinds].reverse())await platform.stopService(state,kind);
    if((await platform.runtimeProcesses(state)).count || await platform.portOwner(state.plan.port))
      fail('STOP_UNCONFIRMED','Could not confirm the service stopped; preserve intent and inspect processes.',undefined,25);
    const revised={...state,activeAllowedDirectories:next.nextDirectories,rootsRevision:rootsRevision(state)+1};
    const updatedSettings=await settings(revised);
    await atomicJson(configPath,{...config,allowedDirectories:next.nextDirectories});
    await atomicJson(path.join(state.plan.stateRoot,'settings.json'),updatedSettings);
    state.activeAllowedDirectories=next.nextDirectories;
    state.rootsRevision=rootsRevision(state)+1;
    state.pendingRootsChange=null;
    state.phase='STOPPED';
    await atomicJson(path.join(state.plan.stateRoot,'install.json'),state);
    if(!wasStopped){
      state.operatorStopped=false;
      await atomicJson(path.join(state.plan.stateRoot,'install.json'),state);
      for(const kind of kinds){
        const task=await platform.taskGet(state.plan.tasks[kind]);
        if(!task?.enabled)await platform.taskEnable(state.plan.tasks[kind]);
        await startOwned(state,kind,platform);
      }
      const after=await platform.probe(state);
      if(!identityMatches(after,state)||canonical(after.allowedFileRoots)!==canonical(next.nextDirectories)||
        after.rootsRevision!==state.rootsRevision)
        fail('ROOTS_RESTART_UNCERTAIN','The restarted broker did not confirm the exact allowed roots.', 'Inspect status and do not replay the update.',25);
      state.phase=phaseAfterVerifiedStart(state);
      await atomicJson(path.join(state.plan.stateRoot,'install.json'),state);
    }
    return envelope('folders',{status:wasStopped?'ROOTS_UPDATED_STOPPED':'ROOTS_UPDATED',
      directories:next.nextDirectories,rootsRevision:state.rootsRevision,
      installationId:state.installationId,previouslyStopped:wasStopped,
      nextAction:wasStopped?'Use an explicit start when ready.':'Confirm tool visibility in ChatGPT; file-tool folders are changed, not shell permissions.'});
  }finally{await lease.release();}
}
