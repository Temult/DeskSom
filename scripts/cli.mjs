import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WindowsPlatform} from './lib/windows.mjs';
import {listRoots,planRoots,applyRoots} from './lib/roots.mjs';
import {listIndex,planIndex,applyIndex,rollbackIndex} from './lib/index-control.mjs';
import {preflight,install,status,repair,serviceControl,loadOwned,ensureTask,startOwned,taskDefinition,taskMatches,readState} from './lib/install-core.mjs';
import {DeskSomError,fail,readJson,createJson,atomicJson,envelope,redactedError,now} from './lib/common.mjs';

export function parseArgs(argv) {
  const [command,...rest]=argv;
  const allowed={plan:['spec','out','json'],install:['plan','approve','accept-shell-access','prepare-only','json'],
    status:['state','deep','json'],verify:['state','deep','exercise','json'],repair:['state','apply','operation','json'],
    start:['state','enable','json'],stop:['state','confirm-stop','json'],
    'export-diagnostics':['state','out','json'],'enable-tunnel':['state','json'],
    'guard-configure':['state','json'],uninstall:['state','confirm-remove-tasks','json'],
    folders:['state','action','request','out','plan','approve','confirm-restart','json'],
    tray:['state','action','json'],index:['state','action','request','out','plan','approve','confirm-restart','confirm-rollback','json'],help:['json']};
  const booleans=new Set(['json','accept-shell-access','prepare-only','deep','exercise','apply','enable','confirm-stop','confirm-remove-tasks','confirm-restart','confirm-rollback']);
  if(!Object.hasOwn(allowed,command))fail('UNKNOWN_COMMAND','Use plan, install, status, verify, repair, start, stop, export-diagnostics, or help.');
  const args={};
  for(let i=0;i<rest.length;i++){
    const token=rest[i];if(!token.startsWith('--'))fail('INVALID_ARGUMENT','Named --arguments are required.');
    const name=token.slice(2);
    if(!allowed[command].includes(name)||Object.hasOwn(args,name))fail('INVALID_ARGUMENT','Unknown or duplicate command argument.');
    if(booleans.has(name)){args[name]=true;continue;}
    const value=rest[++i];if(!value||value.startsWith('--'))fail('INVALID_ARGUMENT','A named argument is missing its value.');
    args[name]=value;
  }
  return {command,args};
}
const requireArg=(args,key)=>{if(!args[key])fail('MISSING_ARGUMENT',`The --${key} argument is required.`);return args[key];};
export async function run(argv,sourceRoot,platform=new WindowsPlatform(sourceRoot)) {
  const {command,args}=parseArgs(argv);
  if(command==='help')return envelope('help',{status:'HELP',commands:['plan','install','status','verify','repair','start','stop','folders','index','export-diagnostics','uninstall'],documentation:'AI_INSTALL.md',notes:'No command accepts plaintext credentials. Use Configure-Tunnel.ps1 in a local owner terminal.'});
  if(command==='plan'){
    const result=await preflight(sourceRoot,await readJson(path.resolve(requireArg(args,'spec'))),platform);
    if(args.out)await createJson(path.resolve(args.out),result.plan);
    return result;
  }
  if(command==='install')return install(sourceRoot,await readJson(path.resolve(requireArg(args,'plan'))),{
    approvePlanSha256:args.approve,acceptShellAccess:!!args['accept-shell-access'],prepareOnly:!!args['prepare-only']},platform);
  const stateRoot=path.resolve(requireArg(args,'state'));
  if(command==='tray'){
    const state=await loadOwned(sourceRoot,stateRoot,platform);
    if(args.action==='status')return envelope('tray',{status:'TRAY_STATUS',...(await platform.trayStatus(state))});
    if(args.action==='launch')return envelope('tray',{status:'TRAY_LAUNCH_REQUESTED',...(await platform.launchTray(state))});
    fail('INVALID_ARGUMENT','Use tray --action status or launch.',undefined,20);
  }
  if(command==='index'){
    if(args.action==='list')return listIndex(sourceRoot,stateRoot,platform);
    if(args.action==='plan'){
      const outcome=await planIndex(sourceRoot,stateRoot,await readJson(path.resolve(requireArg(args,'request'))),platform);
      if(args.out)await createJson(path.resolve(args.out),outcome.proposal);
      return outcome;
    }
    if(args.action==='apply')return applyIndex(sourceRoot,stateRoot,await readJson(path.resolve(requireArg(args,'plan'))),
      requireArg(args,'approve'),!!args['confirm-restart'],platform);
    if(args.action==='rollback')return rollbackIndex(stateRoot,!!args['confirm-rollback'],platform);
    fail('INVALID_ARGUMENT','Use index --action list, plan, apply or rollback.',undefined,20);
  }
  if(command==='folders'){
    if(args.action==='list')return listRoots(sourceRoot,stateRoot,platform);
    if(args.action==='plan'){
      const result=await planRoots(sourceRoot,stateRoot,await readJson(path.resolve(requireArg(args,'request'))),platform);
      if(args.out)await createJson(path.resolve(args.out),result.proposal);
      return result;
    }
    if(args.action==='apply')return applyRoots(sourceRoot,stateRoot,
      await readJson(path.resolve(requireArg(args,'plan'))),requireArg(args,'approve'),
      !!args['confirm-restart'],platform);
    fail('INVALID_ARGUMENT','Use folders --action list, plan or apply.',undefined,20);
  }
  if(['status','verify'].includes(command)){const result=await status(sourceRoot,stateRoot,platform,{deep:!!args.deep,exercise:!!args.exercise});return {...result,command};}
  if(command==='repair')return repair(sourceRoot,stateRoot,platform,{apply:!!args.apply,operation:args.operation});
  if(['start','stop'].includes(command))return serviceControl(sourceRoot,stateRoot,platform,command,{enable:!!args.enable,confirmStop:!!args['confirm-stop']});
  if(command==='guard-configure'){
    const state=await loadOwned(sourceRoot,stateRoot,platform);
    const check=await platform.probe(state);
    if(!check.ready)fail('LOCAL_NOT_READY','Verify the local service before configuring its tunnel.',undefined,10);
    return envelope(command,{status:'OWNER_PROMPT_ALLOWED',installationId:state.installationId,stateRoot});
  }
  if(command==='enable-tunnel'){
    const state=await loadOwned(sourceRoot,stateRoot,platform);
    const lease=await platform.lock(stateRoot);
    try{
      if(!state.credentialsConfigured)fail('CREDENTIALS_REQUIRED','Enter tunnel credentials in the local owner prompt.',undefined,10);
      await platform.ensureLaunchers(state);await ensureTask(state,'tunnel',platform);await startOwned(state,'local',platform);await startOwned(state,'tunnel',platform);
      return envelope(command,{status:'TUNNEL_READY',readyForChatGPTVerification:true,nextAction:'Add the private MCP connection in ChatGPT and make a real tool call. This local command cannot prove that part.'});
    }finally{await lease.release();}
  }
  if(command==='export-diagnostics'){
    let check;
    try{check=await status(sourceRoot,stateRoot,platform);}catch(e){check={operationOk:false,error:redactedError(e)};}
    // An allowlist, not regex scrubbing of raw logs. Excludes usernames, hosts, paths,
    // task command lines, configuration, user content and all credential material.
    const diagnostic={schemaVersion:'desksom.diagnostics/v1',at:now(),operationOk:check.operationOk===true,
      version:check.version??null,localReady:check.localReady===true,tunnelReady:check.tunnelReady===true,
      checkIds:check.verification?.checks?.map(x=>({id:x.id,status:x.status}))??[],
      taskSummary:check.tasks?Object.fromEntries(Object.entries(check.tasks).map(([k,v])=>[k,{present:!!v.present,matches:!!v.matches,state:v.state??null,enabled:v.enabled??null}])):{},
      errorCode:check.error?.code??null,redaction:'Fixed-field summary. Raw logs and paths were not collected.'};
    await createJson(path.resolve(requireArg(args,'out')),diagnostic);
    return envelope(command,{status:'DIAGNOSTICS_EXPORTED',redacted:true,containsRawLogs:false,nextAction:'Review the small JSON summary before sharing it.'});
  }
  if(command==='uninstall'){
    if(!args['confirm-remove-tasks'])fail('REMOVAL_APPROVAL_REQUIRED','Task removal requires explicit owner approval.',undefined,10);
    const state=await loadOwned(sourceRoot,stateRoot,platform),lease=await platform.lock(stateRoot);
    try{
      if(!state.operatorStopped)fail('STOP_FIRST','Stop and reconcile the owned services before removing their tasks.',undefined,10);
      await platform.trayStatus(state); // Validate ownership before any task removals.
      if((await platform.runtimeProcesses(state)).count)fail('RUNTIME_BUSY','Owned processes are still running.',undefined,23);
      for(const kind of ['tunnel','local']){
        const t=await platform.taskGet(state.plan.tasks[kind]);
        if(t){if(!taskMatches(t,taskDefinition(state.plan,state,kind)))fail('TASK_DRIFT','A changed task will not be removed.',undefined,22);
          await platform.helper('remove-stopped-task',{stateFile:path.join(stateRoot,'install.json'),kind});}
      }
      await platform.removeTrayStartup(state);
      state.phase='TASKS_REMOVED';await atomicJson(path.join(stateRoot,'install.json'),state);
      return envelope(command,{status:'TASKS_REMOVED',runtimeRetained:true,credentialsRetained:true,workFilesRetained:true,nextAction:'No project or credential files were deleted. Retain them for recovery or remove explicitly after review.'});
    }finally{await lease.release();}
  }
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  try{
    const result=await run(process.argv.slice(2),sourceRoot);
    process.stdout.write(JSON.stringify(result)+'\n');process.exitCode=result.operationOk===false?10:0;
  }catch(e){
    process.stdout.write(JSON.stringify(envelope(process.argv[2]||'unknown',{operationOk:false,status:'BLOCKED',error:redactedError(e)}))+'\n');
    process.exitCode=e instanceof DeskSomError?e.exitCode:24;
  }
}
