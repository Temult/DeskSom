import {verifyPdfFontOverlay} from '../../pdf-font-overlay.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {profileToBrokerSettings} from './index-profile.mjs';
import {DeskSomError, fail, canonical, hashObject, hashFile, exists, readJson, atomicJson, createJson,
  keysOnly, instanceName, normalizeWin, insideWin, overlapWin, assertNoLinks, loadRelease, now, envelope} from './common.mjs';

export const effectiveRoots = state => state.activeAllowedDirectories ?? state.plan.allowedDirectories;
export const rootsRevision = state => state.rootsRevision ?? 0;

export function makePlan(sourceRoot, spec, environment, release) {
  keysOnly(spec, ['instance','installRoot','stateRoot','allowedDirectories','port'], 'installation specification');
  const instance = instanceName(spec.instance ?? 'default');
  if (environment.platform !== 'win32' || environment.architecture !== 'x64')
    fail('UNSUPPORTED_PLATFORM', 'This release supports Windows x64 only.', 'Use a supported Windows x64 computer; Linux, macOS and ARM are not qualified.');
  const nodeParts=String(environment.nodeVersion??(environment.nodeMajor+'.0.0')).replace(/^v/,'').split('.').map(Number);
  const nodeSupported=nodeParts.length===3&&nodeParts.every(Number.isInteger)&&(nodeParts[0]>22||(nodeParts[0]===22&&nodeParts[1]>=12));
  if (!environment.pwsh || !environment.node || environment.nodeMajor < 22 || !nodeSupported || !environment.pwshSupported)
    fail('PREREQUISITES_MISSING', 'PowerShell 7.4+ and Node.js 22.12+ are required.', 'Run Start-DeskSom.cmd or follow docs/PREREQUISITES.md.');
  if (environment.elevated) fail('ELEVATED_SESSION', 'The installer must run as a normal, non-elevated user.', 'Close this administrator terminal and open a normal terminal.');
  if (!environment.sid || !environment.host) fail('IDENTITY_UNAVAILABLE', 'Windows user and host identity could not be established.');
  sourceRoot = normalizeWin(sourceRoot);
  const installRoot = normalizeWin(spec.installRoot ?? path.win32.join(environment.localAppData,'Programs','DeskSom',instance));
  const stateRoot = normalizeWin(spec.stateRoot ?? path.win32.join(environment.localAppData,'DeskSom',instance));
  if (overlapWin(sourceRoot, installRoot) || overlapWin(sourceRoot, stateRoot) || overlapWin(installRoot,stateRoot))
    fail('OVERLAPPING_PATHS', 'Source, installed runtime and private state directories must be separate.', 'Use separate directories, not parents or children of one another.');
  if (!Array.isArray(spec.allowedDirectories) || !spec.allowedDirectories.length || spec.allowedDirectories.length > 20)
    fail('ROOTS_REQUIRED', 'Choose 1-20 explicit directories for the file tools.', 'Ask the owner which existing project folder should be available.');
  const allowedDirectories = [...new Set(spec.allowedDirectories.map(normalizeWin).map(s=>s.toLowerCase()))].sort();
  for (const root of [installRoot,stateRoot,...allowedDirectories]) {
    if (root.length < 4 || [environment.windowsDir,environment.programFiles].filter(Boolean).some(s=>insideWin(root,s)))
      fail('SENSITIVE_ROOT', 'Whole drives and Windows/program installation directories are not accepted.', 'Choose a dedicated user-owned directory.');
  }
  if (allowedDirectories.some(p=>overlapWin(p,installRoot)||overlapWin(p,stateRoot)))
    fail('SELF_ACCESS_ROOT', 'File-tool roots must not include the installed service or private credentials.', 'Choose a separate work directory. Terminal permissions remain broader.');
  const port = spec.port ?? 18789;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) fail('INVALID_PORT','Choose an integer TCP port from 1024 to 65535.');
  const core = {
    schemaVersion:'desksom.plan/v1', sourceRoot, sourceFingerprint:release.fingerprint,
    version:release.manifest.version, instance, installRoot, stateRoot, allowedDirectories, port,
    binding:{host:environment.host,sid:environment.sid,architecture:environment.architecture},
    tasks:{local:`DeskSom-${instance}-Local`,tunnel:`DeskSom-${instance}-Tunnel`},
    permissions:{shell:'FULL_WINDOWS_USER_PERMISSIONS_NOT_A_SANDBOX',elevated:false,publicInboundPort:false},
    downloads:{npm:'pinned lockfile from registry.npmjs.org',tunnel:'pinned OpenAI tunnel-client archive'},
    externalRequirements:['Owner creates or selects a private OpenAI tunnel with appropriate permissions.',
      'Owner enters the runtime key only in a local masked prompt.','ChatGPT must make a real tool call before end-to-end setup is complete.']
  };
  return {...core,planSha256:hashObject(core)};
}
export function checkPlanShape(plan) {
  keysOnly(plan,['schemaVersion','sourceRoot','sourceFingerprint','version','instance','installRoot','stateRoot','allowedDirectories','port','binding','tasks','permissions','downloads','externalRequirements','planSha256'],'plan');
  const {planSha256,...core} = plan;
  if (plan.schemaVersion !== 'desksom.plan/v1' || !/^[a-f0-9]{64}$/.test(planSha256||'') || hashObject(core) !== planSha256)
    fail('PLAN_CHANGED','The plan does not match its SHA-256 digest.', 'Run preflight again and review the resulting plan.',21);
}
export async function verifyPlan(plan, sourceRoot, platform) {
  checkPlanShape(plan);
  if (normalizeWin(sourceRoot).toLowerCase() !== plan.sourceRoot.toLowerCase()) fail('SOURCE_MOVED','This plan was made from another source directory.');
  const release = await loadRelease(sourceRoot), environment = await platform.environment();
  const expected = makePlan(sourceRoot, {instance:plan.instance,installRoot:plan.installRoot,stateRoot:plan.stateRoot,
    allowedDirectories:plan.allowedDirectories,port:plan.port},environment,release);
  if (canonical(expected) !== canonical(plan)) fail('PLAN_STALE','Source, host, user, or plan semantics have changed.', 'Do not edit the plan. Create and approve a fresh plan.',21);
  for (const p of [plan.sourceRoot,plan.installRoot,plan.stateRoot,...plan.allowedDirectories]) await assertNoLinks(p);
  for (const p of plan.allowedDirectories) {
    const st = await fs.stat(p).catch(()=>null);
    if (!st?.isDirectory()) fail('ROOT_NOT_FOUND','An allowed work directory is not present.', 'Create or choose the intended work folder and run preflight again.');
  }
  return {release, environment};
}
export async function preflight(sourceRoot, spec, platform) {
  const environment = await platform.environment(), release = await loadRelease(sourceRoot);
  const plan = makePlan(sourceRoot,spec,environment,release);
  await verifyPlan(plan,sourceRoot,platform);
  const checks = [];
  const state = await readState(plan.stateRoot);
  if (state && state.planSha256 !== plan.planSha256) fail('OTHER_INSTALLATION','This state directory belongs to a different plan.', 'Use the existing installation controls or choose a different instance.',22);
  for (const [kind,name] of Object.entries(plan.tasks)) {
    const task=await platform.taskGet(name);
    if (task && (!state || !taskMatches(task,taskDefinition(plan,state,kind)))) fail('TASK_COLLISION','A planned task name is already used by a different task.', 'Do not overwrite it. Choose another instance or inspect the existing installation.',22);
  }
  if (plan.instance === 'default' && (await platform.legacyPresent()))
    fail('LEGACY_INSTALLATION','A previous DeskSom installation is present.', 'Use its current status controls. This fresh-install workflow will not migrate the live 0.1.x installation.',22);
  for (const p of [plan.installRoot,plan.stateRoot]) {
    if (await exists(p) && (await fs.readdir(p)).length && !state) fail('DIRECTORY_OCCUPIED','A selected install/state directory is not empty and is not owned by this installer.', 'Choose empty directories; do not delete existing files.',22);
  }
  const listening=await platform.portOwner(plan.port);
  if (listening && !state) fail('PORT_OCCUPIED','The selected loopback port is already in use.', 'Choose another port or inspect the existing service. Never kill an unknown process.',22);
  if (state) {
    await assertOwnership(plan,state);
    if (listening) { const p=await platform.probe(state); if (!identityMatches(p,state)) fail('PORT_OCCUPIED','Another process occupies this installation port.', 'Inspect the port owner; do not terminate it.',22); }
  }
  checks.push({id:'source_integrity',status:'PASS'},{id:'host_and_user',status:'PASS'},
    {id:'prerequisites',status:'PASS'},{id:'paths_and_collisions',status:'PASS'});
  return envelope('plan',{status:'PLAN_READY',checks,plan,nextAction:'Review the plan, approve its digest, and explicitly acknowledge shell access before installation.'});
}
export async function readState(stateRoot) {
  const p=path.join(stateRoot,'install.json'); if (!(await exists(p))) return null;
  const state=await readJson(p);
  if (state.schemaVersion!=='desksom.install/v1' || !state.installationId || !state.plan || state.planSha256!==state.plan.planSha256)
    fail('STATE_INVALID','The installation record is malformed.', 'Preserve state and inspect it; do not overwrite it.',21);
  checkPlanShape(state.plan);
  if (state.plan.stateRoot.toLowerCase()!==normalizeWin(stateRoot).toLowerCase()) fail('STATE_PATH_MISMATCH','The state record is not at its bound location.',undefined,21);
  if (state.runtimeRoot && normalizeWin(state.runtimeRoot).toLowerCase()!==path.win32.join(state.plan.installRoot,'runtime').toLowerCase()) fail('RUNTIME_PATH_MISMATCH','The runtime path differs from the approved installation.',undefined,21);
  return state;
}
function statePaths(plan) { return {runtime:path.join(plan.installRoot,'runtime'),record:path.join(plan.stateRoot,'install.json')}; }
async function saveState(state) { state.updatedAt=now(); await atomicJson(path.join(state.plan.stateRoot,'install.json'),state); }
export async function assertOwnership(plan,state) {
  if (state.planSha256!==plan.planSha256 || canonical(state.plan)!==canonical(plan)) fail('STATE_PLAN_CONFLICT','The saved installation belongs to another plan.',undefined,22);
  const marker=path.join(plan.installRoot,'.desksom-owner.json');
  if (await exists(marker)) {
    const m=await readJson(marker);
    if (m.installationId!==state.installationId || m.planSha256!==plan.planSha256 || m.stateRoot!==plan.stateRoot)
      fail('OWNER_MISMATCH','The installation-directory ownership marker does not match.',undefined,22);
  } else if (await exists(plan.installRoot) && (await fs.readdir(plan.installRoot)).length)
    fail('OWNER_MISMATCH','An occupied install directory has no matching ownership marker.',undefined,22);
}
export function taskDefinition(plan,state,kind) {
  if (!['local','tunnel'].includes(kind)) fail('INVALID_KIND','Unknown service type.');
  return {name:plan.tasks[kind],kind,installationId:state.installationId,sid:plan.binding.sid,
    execute:state.environment.wscript,arguments:`//B //Nologo "${path.join(plan.installRoot,'Launch-'+kind+'.vbs')}"`,
    workingDirectory:plan.installRoot,runLevel:'Limited',logonType:'Interactive'};
}
export function taskMatches(actual,expected) {
  if (!actual || !expected) return false;
  return ['name','execute','arguments','workingDirectory','runLevel','logonType','sid','installationId'].every(k=>String(actual[k]??'').toLowerCase()===String(expected[k]??'').toLowerCase());
}
export function identityMatches(probe,state) {
  return probe?.ready===true && probe.host===state.plan.binding.host && probe.instance===state.plan.instance &&
    probe.installationId===state.installationId && probe.sourceFingerprint===state.plan.sourceFingerprint && probe.version===state.plan.version;
}
async function noRunningWork(state,platform) {
  const marker=path.join(state.plan.stateRoot,'native-active.json');
  if(await exists(marker)){const prior=await readJson(marker);if(prior.installationId!==state.installationId || !['EXITED','START_FAILED'].includes(prior.phase))
    fail('CHILD_OUTCOME_UNCERTAIN','A prior preparation process has no confirmed completion receipt.','Inspect exact local processes and the private receipt; no automatic recovery or replay is allowed.',25);}
  const running=await platform.runtimeProcesses(state);
  if (running.count) fail('RUNTIME_BUSY','Owned runtime processes are still running.', 'Do not replay installation actions. Wait or reconcile the active work.',23);
  for (const name of Object.values(state.plan.tasks)) {
    const t=await platform.taskGet(name);
    if (t?.state==='Running' || t?.state==='Queued') fail('RUNTIME_BUSY','A service task is still running or queued.', 'Wait or deliberately stop the owned service before proceeding.',23);
  }
}
async function step(state,name,fn) {
  state.pending={step:name,startedAt:now()}; await saveState(state);
  const value=await fn(); state.completed[name]={at:now()}; state.pending=null; await saveState(state); return value;
}
async function copyRelease(sourceRoot,runtime,release) {
  await fs.mkdir(runtime,{recursive:true});
  for (const item of release.manifest.files) {
    const to=path.join(runtime,item.path); await assertNoLinks(to); await fs.mkdir(path.dirname(to),{recursive:true});
    if (await exists(to)) {
      if (await hashFile(to)!==item.sha256) fail('RUNTIME_SOURCE_DRIFT','Installed source differs from the approved release.', 'Do not overwrite or reseal the runtime; investigate the modified file.',21);
    } else await fs.copyFile(path.join(sourceRoot,item.path),to,fs.constants.COPYFILE_EXCL);
  }
  const data=await fs.readFile(path.join(sourceRoot,'release-manifest.json'));
  const to=path.join(runtime,'release-manifest.json');
  if (await exists(to)) { if ((await fs.readFile(to)).compare(data)!==0) fail('RUNTIME_SOURCE_DRIFT','Runtime release manifest differs.',undefined,21); }
  else await fs.writeFile(to,data,{flag:'wx'});
}
export async function settings(state) {
  const p=state.plan, roots=effectiveRoots(state);
  return {expectedHost:p.binding.host,port:p.port,stateDir:p.stateRoot,workDir:roots[0],
    allowedDirectories:roots,rootsRevision:rootsRevision(state),
    instance:p.instance,installationId:state.installationId,sourceFingerprint:p.sourceFingerprint,
    // Strict default-off inspection flag. Preserve independently from the index profile.
    enableProjectInspect:state.projectInspectEnabled===true,
    projectInspectRevision:state.inspectionRevision??0,
    ...(state.projectInspectEnabled===true && typeof state.projectInspectGitExecutable==='string'
      ? {projectInspectGitExecutable:state.projectInspectGitExecutable} : {}),
    ...(state.indexProfile ? {fastFilenameIndex:profileToBrokerSettings(state,state.indexProfile)} : {})};
}
async function sealDependencies(runtime) {
  const files=[];
  async function walk(dir,relative) {
    for (const entry of await fs.readdir(dir,{withFileTypes:true})) {
      const full=path.join(dir,entry.name), rel=relative+'/'+entry.name;
      if (entry.isSymbolicLink()) fail('DEPENDENCY_LINK','A dependency contains an unexpected filesystem link.',undefined,21);
      if (entry.isDirectory()) await walk(full,rel);
      else if (entry.isFile()) files.push({path:rel,sha256:await hashFile(full)});
    }
  }
  await walk(path.join(runtime,'node_modules'),'node_modules');
  files.sort((a,b)=>a.path.localeCompare(b.path));
  return {schemaVersion:'desksom.dependencies/v1',files,fingerprint:hashObject(files)};
}
async function checkDependencies(runtime,seal,deep=false) {
  if (!seal || seal.schemaVersion!=='desksom.dependencies/v1' || !Array.isArray(seal.files) || hashObject(seal.files)!==seal.fingerprint) return false;
  const policy=await readJson(path.join(runtime,'release-policy.json'));
  try {
    if ((await readJson(path.join(runtime,'node_modules/@wonderwhy-er/desktop-commander/package.json'))).version!==policy.engineVersion) return false;
    if ((await readJson(path.join(runtime,'node_modules/@modelcontextprotocol/sdk/package.json'))).version!==policy.sdkVersion) return false;
    const overlay=await readJson(path.join(runtime,'engine-overlay.json'));
    if (await hashFile(path.join(runtime,'node_modules/@wonderwhy-er/desktop-commander/dist/config.js'))!==overlay.patched_sha256) return false;
    await verifyPdfFontOverlay(runtime,overlay);
    if (deep) {
      for (const item of seal.files) {
        if (!item.path.startsWith('node_modules/') || item.path.split('/').some(s=>s==='..') || item.path.includes('\\')) return false;
        await assertNoLinks(path.join(runtime,item.path));
        if (await hashFile(path.join(runtime,item.path))!==item.sha256) return false;
      }
      const current=await sealDependencies(runtime);if(current.fingerprint!==seal.fingerprint)return false;
    }
    return true;
  } catch { return false; }
}
export async function install(sourceRoot,plan,options,platform) {
  if (!options.acceptShellAccess || options.approvePlanSha256!==plan.planSha256)
    fail('CONSENT_REQUIRED','Exact plan approval and an explicit shell-access acknowledgment are required.', 'Review the folders, download plan and full-user shell permissions with the owner.',10);
  const {release,environment}=await verifyPlan(plan,sourceRoot,platform);
  const lease=await platform.lock(plan.stateRoot);
  try {
    let state=await readState(plan.stateRoot);
    if (!state) {
      await preflight(sourceRoot,{instance:plan.instance,installRoot:plan.installRoot,stateRoot:plan.stateRoot,allowedDirectories:plan.allowedDirectories,port:plan.port},platform);
      await platform.protectDirectory(plan.stateRoot);
      state={schemaVersion:'desksom.install/v1',installationId:crypto.randomUUID(),planSha256:plan.planSha256,plan,
        environment:{node:environment.node,pwsh:environment.pwsh,npmCli:environment.npmCli,wscript:environment.wscript,windowsPowerShell:environment.windowsPowerShell},
        phase:'RESERVED',completed:{},pending:null,createdAt:now(),operatorStopped:false,credentialsConfigured:false,
        rootsRevision:0,activeAllowedDirectories:plan.allowedDirectories};
      await createJson(path.join(plan.stateRoot,'install.json'),state);
    }
    await assertOwnership(plan,state); lease.assertHeld();
    await fs.mkdir(plan.installRoot,{recursive:true});
    const marker=path.join(plan.installRoot,'.desksom-owner.json');
    if (!(await exists(marker))) await createJson(marker,{installationId:state.installationId,planSha256:plan.planSha256,stateRoot:plan.stateRoot});
    const {runtime}=statePaths(plan); state.runtimeRoot=runtime;
    await step(state,'source',async()=>copyRelease(sourceRoot,runtime,release));
    state.releaseManifestSha256=await hashFile(path.join(runtime,'release-manifest.json')); await saveState(state);
    const cfg=await settings(state), cfgPath=path.join(plan.stateRoot,'settings.json');
    if (await exists(cfgPath)) { if (canonical(await readJson(cfgPath))!==canonical(cfg)) fail('SETTINGS_DRIFT','Runtime settings differ from the approved plan.',undefined,21); }
    else await createJson(cfgPath,cfg);
    await fs.mkdir(path.join(plan.stateRoot,'logs'),{recursive:true});
    const sealPath=path.join(plan.stateRoot,'dependencies.json');
    let dependencySeal=await exists(sealPath)?await readJson(sealPath):null;
    if (dependencySeal) {
      if (!(await checkDependencies(runtime,dependencySeal,true))) fail('DEPENDENCY_DRIFT','The installed dependency tree has changed.', 'Do not reinstall over a running service. Preserve evidence and use a new, reviewed installation.',21);
    } else {
      await noRunningWork(state,platform);
      await step(state,'dependencies',async()=>{
        await platform.prepareDependencies(state); lease.assertHeld();
        dependencySeal=await sealDependencies(runtime);
        await atomicJson(sealPath,dependencySeal);
      });
    }
    state.dependencyFingerprint=dependencySeal.fingerprint;
    const tunnel=path.join(runtime,'bin','tunnel-client.exe');
    const policy=await readJson(path.join(runtime,'release-policy.json'));
    if (await exists(tunnel)) {
      if (await hashFile(tunnel)!==policy.tunnelExeSha256) fail('TUNNEL_BINARY_DRIFT','The tunnel executable does not match the pinned release.',undefined,21);
    } else {
      await noRunningWork(state,platform);
      await step(state,'tunnel_download',async()=>platform.prepareTunnel(state,policy));
      if (await hashFile(tunnel)!==policy.tunnelExeSha256) fail('TUNNEL_BINARY_DRIFT','Downloaded tunnel failed final verification.',undefined,21);
    }
    lease.assertHeld();
    if (!state.qualification || state.qualification.sourceFingerprint!==plan.sourceFingerprint || state.qualification.dependencyFingerprint!==dependencySeal.fingerprint) {
      await noRunningWork(state,platform);
      await step(state,'qualification',async()=>{
        const result=await platform.qualify(state);
        if (result?.passed!==true || result.acceptancePasses!==26 || result.acceptanceFailures!==0)
          fail('QUALIFICATION_FAILED','The isolated runtime checks did not pass.', 'Inspect the private qualification log; do not deploy this candidate.',24);
        state.qualification={...result,sourceFingerprint:plan.sourceFingerprint,dependencyFingerprint:dependencySeal.fingerprint,at:now()};
      });
    }
    if (options.prepareOnly && state.completed.local_task) {
      return envelope('install',{status:'ALREADY_INSTALLED',installationId:state.installationId,stateRoot:plan.stateRoot,
        tasksCreated:false,nextAction:'An owned installation already exists. Use status, verify or explicit start/stop; preparation will not downgrade it.'});
    }
    if (options.prepareOnly) {
      state.phase='PREPARED'; await saveState(state);
      return envelope('install',{status:'PREPARED',installationId:state.installationId,stateRoot:plan.stateRoot,
        qualification:state.qualification,tasksCreated:false,nextAction:'Run install again with the same approved plan to register the local service. No tunnel key was needed.'});
    }
    await platform.ensureSecret(state);
    await step(state,'launchers',async()=>platform.ensureLaunchers(state));
    await step(state,'local_task',async()=>ensureTask(state,'local',platform));
    state.phase='INSTALLED'; await saveState(state);
    if (state.operatorStopped) return envelope('install',{status:'INSTALLED_STOPPED',nextAction:'The owner stopped this installation. Use an explicit start command to run it again.'});
    await startOwned(state,'local',platform);
    state.phase='LOCAL_READY'; await saveState(state);
    await step(state,'tray_startup',async()=>platform.ensureTrayStartup(state));
    return envelope('install',{status:'LOCAL_READY',stateRoot:plan.stateRoot,installationId:state.installationId,
      sourceFingerprint:plan.sourceFingerprint,qualification:state.qualification,nextAction:'Enter your own tunnel credentials locally, connect ChatGPT, and verify a real ChatGPT tool call.'});
  } finally { await lease.release(); }
}
export async function ensureTask(state,kind,platform) {
  const expected=taskDefinition(state.plan,state,kind), existing=await platform.taskGet(expected.name);
  if (existing) {
    if (!taskMatches(existing,expected)) fail('TASK_DRIFT','A service task differs from this installation record.', 'Do not overwrite, stop, or start the foreign task.',22);
    return;
  }
  await platform.taskCreate(expected);
  if (!taskMatches(await platform.taskGet(expected.name),expected)) fail('TASK_WRITE_UNCERTAIN','Task registration could not be independently verified.', 'Read task status before retrying; no success has been recorded.',25);
}
export async function loadOwned(sourceRoot,stateRoot,platform,deep=false,{inspectionRecovery=false}={}) {
  const state=await readState(stateRoot);
  if (!state) fail('NOT_INSTALLED','No DeskSom installation record was found here.', 'Run preflight and install, or select the existing state directory.',10);
  const callerRelease=await loadRelease(sourceRoot), environment=await platform.environment();
  if (![state.plan.sourceRoot,state.runtimeRoot].some(p=>normalizeWin(p).toLowerCase()===normalizeWin(sourceRoot).toLowerCase()))
    fail('SOURCE_MOVED','Use the original approved source or the installed runtime to manage this instance.');
  const expectedPlan=makePlan(state.plan.sourceRoot,{instance:state.plan.instance,installRoot:state.plan.installRoot,stateRoot:state.plan.stateRoot,allowedDirectories:state.plan.allowedDirectories,port:state.plan.port},environment,callerRelease);
  if (canonical(expectedPlan)!==canonical(state.plan)) fail('PLAN_STALE','Management source, host, user or policy differs from the installed plan.',undefined,21);
  await assertOwnership(state.plan,state);
  if (state.pendingRootsChange) fail('ROOTS_CHANGE_UNCERTAIN','An interrupted folder update must be inspected before further management commands.', 'Preserve state and pending change receipt; do not blindly replay.',25);
  if (state.pendingIndexChange) fail('INDEX_CHANGE_UNCERTAIN','An interrupted indexed-search configuration change must be inspected before other management commands.','Use the guarded index status and rollback path after verifying service state.',25);
  if(state.pendingInspectionChange&&!inspectionRecovery)fail('INSPECTION_CHANGE_UNCERTAIN','An inspection change is unfinished. Use inspection list and explicit rollback.',undefined,25);
  const runtimeRelease=await loadRelease(state.runtimeRoot);
  if (runtimeRelease.fingerprint!==state.plan.sourceFingerprint || await hashFile(path.join(state.runtimeRoot,'release-manifest.json'))!==state.releaseManifestSha256)
    fail('RUNTIME_SOURCE_DRIFT','The deployed source no longer matches the installation record.',undefined,21);
  const expected=await settings(state), actual=await readJson(path.join(state.plan.stateRoot,'settings.json'));
  if(state.pendingInspectionChange&&inspectionRecovery){
    const pending=state.pendingInspectionChange,p=pending.proposal;
    if(pending.schema!=='desksom.inspection-intent/v1'||!p)fail('INSPECTION_RECOVERY_DRIFT','Invalid inspection recovery receipt.');
    const {approvalSha256,...body}=p;
    if(hashObject(body)!==approvalSha256||p.installationId!==state.installationId||p.planSha256!==state.planSha256||p.sourceFingerprint!==state.plan.sourceFingerprint||
      p.rootsRevision!==rootsRevision(state)||p.indexProfileSha256!==hashObject(state.indexProfile??null))fail('INSPECTION_RECOVERY_DRIFT','Inspection recovery identity changed.',undefined,21);
    const variants=[];
    for(const value of [p.previous,p.next]){
      if(typeof value?.enabled!=='boolean'||!Number.isSafeInteger(value.revision))fail('INSPECTION_RECOVERY_DRIFT','Invalid inspection recovery state.');
      const copy={...state,projectInspectEnabled:value.enabled,inspectionRevision:value.revision};
      if(value.gitExecutable)copy.projectInspectGitExecutable=value.gitExecutable;else delete copy.projectInspectGitExecutable;
      variants.push(await settings(copy));
    }
    if(!variants.some(v=>canonical(v)===canonical(actual)))fail('INSPECTION_RECOVERY_SETTINGS_DRIFT','Settings match neither side of the approved inspection change.',undefined,21);
  }else if (canonical(expected)!==canonical(actual)) fail('SETTINGS_DRIFT','Runtime settings differ from the approved root policy.',undefined,21);
  const dcConfig=await readJson(path.join(state.plan.stateRoot,'dc','config.json'));
  if (canonical(dcConfig.allowedDirectories)!==canonical(effectiveRoots(state)))
    fail('ROOTS_CONFIG_DRIFT','Engine file-tool folders differ from the approved policy.', 'Inspect private state and engine configuration; do not auto-repair.',21);
  if (!(await checkDependencies(state.runtimeRoot,await readJson(path.join(state.plan.stateRoot,'dependencies.json')),deep)))
    fail('DEPENDENCY_DRIFT','Installed dependencies failed integrity checks.',undefined,21);
  const policy=await readJson(path.join(state.runtimeRoot,'release-policy.json'));
  if (await hashFile(path.join(state.runtimeRoot,'bin','tunnel-client.exe'))!==policy.tunnelExeSha256)
    fail('TUNNEL_BINARY_DRIFT','The tunnel executable has changed.',undefined,21);
  return state;
}
export async function startOwned(state,kind,platform) {
  const expected=taskDefinition(state.plan,state,kind), task=await platform.taskGet(expected.name);
  if (!task || !taskMatches(task,expected)) fail('TASK_DRIFT','The expected task is missing or differs.', 'Use read-only repair diagnostics. Never start a foreign task.',22);
  if (!task.enabled) fail('TASK_DISABLED','This task is disabled.', 'Use start with explicit enable approval after confirming the owner intends to run it.',10);
  if (kind==='local') {
    const probe=await platform.probe(state);
    if (identityMatches(probe,state)) return probe;
    if (await platform.portOwner(state.plan.port)) fail('PORT_OCCUPIED','The expected identity was not found on the occupied port.', 'Inspect the owning process; do not terminate it.',22);
  }
  if (kind==='tunnel' && !state.credentialsConfigured) fail('CREDENTIALS_REQUIRED','Tunnel credentials have not been configured.', 'Run Configure-Tunnel locally, not through a secret-bearing tool argument.',10);
  if (task.state!=='Running' && task.state!=='Queued') {
    const processes=await platform.runtimeProcesses(state,kind);
    if (processes.count) fail('UNOWNED_PROCESS_STATE','A service process exists without the expected task state.', 'Reconcile it read-only before starting another copy.',23);
    await platform.taskStart(expected.name);
  }
  const probe=await platform.waitReady(state,kind);
  if (kind==='local' ? !identityMatches(probe,state) : !probe?.ready || probe.controlPlane!=='ok')
    fail('START_OUTCOME_UNCERTAIN','The service has not passed readiness checks yet.', 'It may still be starting. Read status; do not repeat writes or kill processes.',25);
  return probe;
}
export async function status(sourceRoot,stateRoot,platform,{deep=false,exercise=false}={}) {
  const state=await loadOwned(sourceRoot,stateRoot,platform,deep);
  const local=await platform.probe(state), tunnel=await platform.tunnelProbe(state);
  const tasks={};
  for (const kind of ['local','tunnel']) {
    const t=await platform.taskGet(state.plan.tasks[kind]);
    tasks[kind]=!t?{present:false}: {present:true,matches:taskMatches(t,taskDefinition(state.plan,state,kind)),state:t.state,enabled:t.enabled};
  }
  const localReady=identityMatches(local,state);
  if (exercise && !localReady) fail('LOCAL_NOT_READY','The service cannot run the requested disposable check.', 'Resolve the read-only health checks first.',10);
  const verification=localReady?await platform.verifyMcp(state,exercise):null;
  return envelope(exercise?'verify':'status',{status:localReady && verification?.passed?'LOCAL_READY':'ATTENTION_REQUIRED',
    operationOk:localReady && verification?.passed===true,installationId:state.installationId,version:state.plan.version,
    host:state.plan.binding.host,sourceFingerprint:state.plan.sourceFingerprint,localReady,tunnelReady:tunnel?.ready===true && tunnel.controlPlane==='ok',
    readyForChatGPTVerification:localReady && verification?.passed===true && tunnel?.ready===true && tunnel.controlPlane==='ok',
    tasks,local,tunnel,verification,operatorStopped:state.operatorStopped,
    allowedDirectories:effectiveRoots(state),rootsRevision:rootsRevision(state),statistics:local?.statistics??null,
    projectInspection:localReady?(local?.projectInspection??null):null,
    indexWorkerReady:localReady?(local?.indexWorkerReady??null):null,
    indexStatus:localReady?(local?.indexStatus??null):null,
    allFeaturesReady:localReady?(local?.allFeaturesReady??null):false,
    nextAction:'Local checks cannot prove ChatGPT connectivity. The owner or agent must make a real tool call in ChatGPT.'});
}
export async function repair(sourceRoot,stateRoot,platform,{apply=false,operation}={}) {
  const state=await loadOwned(sourceRoot,stateRoot,platform,true);
  const info=await status(sourceRoot,stateRoot,platform);
  const suggested=Object.entries(info.tasks).filter(([,t])=>!t.present).map(([kind])=>({operation:'restore-missing-task',kind}));
  if (!info.localReady) suggested.push({operation:'start-stopped',kind:'local'});
  if (state.credentialsConfigured && !info.tunnelReady) suggested.push({operation:'start-stopped',kind:'tunnel'});
  if (!apply) return envelope('repair',{status:'DIAGNOSIS_ONLY',changesMade:false,checks:info,suggested,
    nextAction:'Review the diagnosis. Only restore-missing-tasks or start-stopped may be explicitly applied.'});
  if (!['restore-missing-tasks','start-stopped'].includes(operation)) fail('REPAIR_NOT_ALLOWED','No broad reset or automatic source repair is supported.',undefined,20);
  const lease=await platform.lock(stateRoot);
  try {
    if (operation==='restore-missing-tasks') {
      await noRunningWork(state,platform); await platform.ensureLaunchers(state);
      await ensureTask(state,'local',platform);
      if (state.credentialsConfigured) await ensureTask(state,'tunnel',platform);
    } else {
      if (state.operatorStopped) fail('OWNER_STOPPED','Automatic repair respects the owner stop marker.', 'Use an explicit start command after reviewing whether work should resume.',10);
      await startOwned(state,'local',platform);
      if (state.credentialsConfigured) await startOwned(state,'tunnel',platform);
    }
    return envelope('repair',{status:'REPAIR_APPLIED',operation,changesMade:true,nextAction:'Run verify; this does not authorize or replay any application command.'});
  } finally {await lease.release();}
}
export function phaseAfterVerifiedStart(state) { return state.credentialsConfigured ? 'TUNNEL_READY' : 'LOCAL_READY'; }
export async function serviceControl(sourceRoot,stateRoot,platform,command,{confirmStop=false,enable=false}={}) {
  const state=await loadOwned(sourceRoot,stateRoot,platform);
  const lease=await platform.lock(stateRoot);
  try {
    if (command==='start') {
      for (const kind of ['local',...(state.credentialsConfigured?['tunnel']:[])]) {
        const t=await platform.taskGet(state.plan.tasks[kind]);
        if (!t || !taskMatches(t,taskDefinition(state.plan,state,kind))) fail('TASK_DRIFT','The task is missing or changed.',undefined,22);
        if (!t.enabled && !enable) fail('ENABLE_APPROVAL_REQUIRED','The task is disabled. Confirm deliberate restart with --enable.',undefined,10);
      }
      state.operatorStopped=false; await saveState(state);
      for (const kind of ['local',...(state.credentialsConfigured?['tunnel']:[])]) {
        const t=await platform.taskGet(state.plan.tasks[kind]);
        if (!t || !taskMatches(t,taskDefinition(state.plan,state,kind))) fail('TASK_DRIFT','The task is missing or has changed.',undefined,22);
        if (!t.enabled && !enable) fail('ENABLE_APPROVAL_REQUIRED','The service is disabled.', 'Confirm deliberate restart with --enable.',10);
        if (!t.enabled) await platform.taskEnable(t.name);
        await startOwned(state,kind,platform);
      }
      state.operatorStopped=false; state.phase=phaseAfterVerifiedStart(state); await saveState(state);
      return envelope('start',{status:'SERVICES_READY',phase:state.phase,nextAction:'Verify a fresh boot identity before continuing work.'});
    }
    if (command!=='stop' || !confirmStop) fail('STOP_APPROVAL_REQUIRED','Stopping can interrupt running jobs.', 'Explicitly approve stop only after reconciling active jobs.',10);
    // Start the stop intent before effects. Recovery must never undo a deliberate stop.
    state.operatorStopped=true; await saveState(state);
    const probe=await platform.probe(state);
    if (identityMatches(probe,state) && probe.activeCalls>0) fail('ACTIVE_CALLS','The service has active calls.', 'Wait for work to finish. Stop will not be forced.',23);
    for (const kind of ['tunnel','local']) {
      const t=await platform.taskGet(state.plan.tasks[kind]); if (!t) continue;
      if (!taskMatches(t,taskDefinition(state.plan,state,kind))) fail('TASK_DRIFT','A task changed; it will not be stopped.',undefined,22);
      await platform.stopService(state,kind);
    }
    if ((await platform.runtimeProcesses(state)).count || await platform.portOwner(state.plan.port))
      fail('STOP_UNCONFIRMED','Service shutdown could not be fully confirmed.', 'Reconcile processes before restarting or uninstalling.',25);
    state.phase='STOPPED'; await saveState(state);
    return envelope('stop',{status:'STOPPED',credentialsRetained:true,filesRetained:true,nextAction:'Use an explicit start command with --enable when the owner is ready.'});
  } finally { await lease.release(); }
}
