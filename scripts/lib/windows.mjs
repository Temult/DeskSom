import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fail, DeskSomError, readJson, hashFile, exists, atomicJson, now} from './common.mjs';

const cleanEnv = env => Object.fromEntries(Object.entries(env).filter(([k])=>!(/^(OPENAI_|CONTROL_PLANE_|TUNNEL_CLIENT_|DESKSOM_|MCP_|CLOUDFLARED_|NODE_OPTIONS$|NPM_CONFIG_)/i.test(k))));
const sleep = ms => new Promise(r=>setTimeout(r,ms));
export class WindowsPlatform {
  constructor(sourceRoot,{pwsh=process.env.DESKSOM_PWSH || 'pwsh.exe'}={}) { this.sourceRoot=sourceRoot; this.pwsh=pwsh; }
  async helper(op, data={}, timeout=20000) {
    return new Promise((resolve,reject)=>{
      const child=spawn(this.pwsh,['-NoProfile','-NonInteractive','-File',path.join(this.sourceRoot,'scripts','WindowsHost.ps1'),'-Action','Dispatch'],
        {shell:false,windowsHide:true,env:cleanEnv(process.env),stdio:['pipe','pipe','pipe']});
      let stdout='',done=false;
      const finish=(err,value)=>{if(done)return;done=true;clearTimeout(timer);err?reject(err):resolve(value);};
      const timer=setTimeout(()=>{child.kill();finish(new DeskSomError('PLATFORM_TIMEOUT','A Windows operation did not finish in time.','Inspect actual state before retrying.',25));},timeout);
      child.stdout.on('data',b=>{stdout+=b.toString('utf8');if(stdout.length>1024*1024){child.kill();finish(new DeskSomError('PLATFORM_OUTPUT_LIMIT','Windows response exceeded its limit.'));}});
      child.stderr.resume();
      child.on('error',()=>finish(new DeskSomError('POWERSHELL_UNAVAILABLE','The PowerShell helper could not start.','Run the prerequisite check from a normal terminal.')));
      child.on('close',code=>{
        if(done)return;
        try {const result=JSON.parse(stdout.replace(/^\uFEFF/,'').trim());
          if(code!==0 || !result.ok) return finish(new DeskSomError(result.code||'WINDOWS_OPERATION_FAILED',result.message||'The Windows operation failed.',result.nextAction||'Inspect local state before retrying.',result.exitCode||24));
          finish(null,result.value);
        } catch {finish(new DeskSomError('PLATFORM_RESPONSE_INVALID','The Windows helper did not return a valid result.','Check PowerShell and local diagnostics; no success is claimed.',25));}
      });
      child.stdin.end(JSON.stringify({op,...data})+'\n');
    });
  }
  environment(){return this.helper('environment',{node:process.execPath});}
  taskGet(name){return this.helper('task-get',{name});}
  taskCreate(def){return this.helper('task-create',{definition:def});}
  taskStart(name){return this.helper('task-start',{name});}
  taskEnable(name){return this.helper('task-enable',{name});}
  legacyPresent(){return this.helper('legacy-present');}
  portOwner(port){return this.helper('port-owner',{port});}
  protectDirectory(directory){return this.helper('protect-directory',{directory});}
  runtimeProcesses(state,kind=null){return this.helper('processes',{stateFile:path.join(state.plan.stateRoot,'install.json'),kind});}
  probe(state){return this.helper('probe',{stateFile:path.join(state.plan.stateRoot,'install.json')});}
  tunnelProbe(state){return this.helper('tunnel-probe',{stateFile:path.join(state.plan.stateRoot,'install.json')});}
  verifyMcp(state,exercise=false){return this.helper('verify',{stateFile:path.join(state.plan.stateRoot,'install.json'),exercise},60000);}
  ensureSecret(state){return this.helper('ensure-secret',{stateFile:path.join(state.plan.stateRoot,'install.json')});}
  ensureLaunchers(state){return this.helper('ensure-launchers',{stateFile:path.join(state.plan.stateRoot,'install.json')});}
  ensureTrayStartup(state){return this.helper('tray-install',{stateFile:path.join(state.plan.stateRoot,'install.json')});}
  trayStatus(state){return this.helper('tray-status',{stateFile:path.join(state.plan.stateRoot,'install.json')});}
  launchTray(state){return this.helper('tray-launch',{stateFile:path.join(state.plan.stateRoot,'install.json')});}
  removeTrayStartup(state){return this.helper('tray-remove',{stateFile:path.join(state.plan.stateRoot,'install.json')});}
  stopService(state,kind){return this.helper('stop-service',{stateFile:path.join(state.plan.stateRoot,'install.json'),kind},45000);}
  async waitReady(state,kind){
    for(let i=0;i<60;i++) {
      const p=await (kind==='local'?this.probe(state):this.tunnelProbe(state));
      if(p?.ready && (kind==='local'||p.controlPlane==='ok'))return p;
      await sleep(1500);
    }
    return {ready:false};
  }
  async lock(stateRoot) {
    const child=spawn(this.pwsh,['-NoProfile','-NonInteractive','-File',path.join(this.sourceRoot,'scripts','WindowsHost.ps1'),'-Action','Lock'],
      {windowsHide:true,shell:false,env:cleanEnv(process.env),stdio:['pipe','pipe','pipe']});
    let closed=false;
    child.on('close',()=>{closed=true;}); child.stderr.resume();
    const acquired=await new Promise((resolve,reject)=>{
      let text='';const timer=setTimeout(()=>{child.kill();reject(new DeskSomError('LOCK_TIMEOUT','The installation mutex could not be acquired.'));},12000);
      child.on('error',()=>{clearTimeout(timer);reject(new DeskSomError('LOCK_UNAVAILABLE','The Windows mutex helper could not start.'));});
      child.stdout.on('data',b=>{text+=b.toString();if(text.includes('\n')){clearTimeout(timer);try{resolve(JSON.parse(text.trim()));}catch{reject(new DeskSomError('LOCK_UNAVAILABLE','Invalid mutex result.'));}}});
      child.stdin.write(JSON.stringify({stateRoot})+'\n');
    });
    if (!acquired.ok) {child.stdin.end();fail(acquired.code||'INSTALL_BUSY','Another operation holds this installation lock.','Wait for it to finish; do not force an unlock.',23);}
    return {assertHeld(){if(closed)fail('LOCK_LOST','The installation mutex was lost.','Inspect state before continuing.',25);},async release(){
      if(closed)return;child.stdin.end('RELEASE\n');await Promise.race([new Promise(r=>child.once('close',r)),sleep(3000)]);
      if(!closed)child.kill();
    }};
  }
  async native(state,label,exe,args,{timeout=600000,env={}}={}) {
    const log=path.join(state.plan.stateRoot,'logs',label+'-'+Date.now()+'.log');
    const marker=path.join(state.plan.stateRoot,'native-active.json');
    if (await exists(marker)) {
      const prior=await readJson(marker);
      if (prior.installationId!==state.installationId || !['EXITED','START_FAILED'].includes(prior.phase))
        fail('CHILD_OUTCOME_UNCERTAIN','A prior preparation process lacks a confirmed completion receipt.',
          'Preserve native-active.json. Inspect its exact process identity before any operator-approved recovery; no child is replayed.',25);
    }
    const record={schemaVersion:'desksom.native/v1',installationId:state.installationId,label,phase:'INTENT',at:now()};
    await atomicJson(marker,record);
    const handle=await fs.open(log,'wx',0o600);
    let writes=Promise.resolve(),writeFailed=false;
    try {
      const completion=await new Promise((resolve,reject)=>{
        let child;
        try {child=spawn(exe,args,{cwd:state.runtimeRoot,windowsHide:true,shell:false,
          env:{...cleanEnv(process.env),...env},stdio:['ignore','pipe','pipe']});}
        catch {resolve({phase:'START_FAILED',code:null,error:'CHILD_START_FAILED'});return;}
        let written=0,limitHit=false,settled=false;let receipt=Promise.resolve();
        const finish=result=>{if(settled)return;settled=true;clearTimeout(timer);receipt.finally(()=>resolve(result));};
        const timer=setTimeout(()=>{child.kill();finish({phase:'UNCERTAIN',code:null,error:'CHILD_OUTCOME_UNCERTAIN'});},timeout);
        function output(data){
          if(written+data.length>8*1024*1024){limitHit=true;return;}
          written+=data.length;
          writes=writes.then(()=>handle.write(data)).catch(()=>{writeFailed=true;});
        }
        child.stdout.on('data',output);child.stderr.on('data',output);
        child.on('error',()=>finish({phase:'START_FAILED',code:null,error:'CHILD_START_FAILED'}));
        child.on('spawn',()=>{
          // Persist PID and start observation before treating a child as running. If
          // this controller crashes between spawn and receipt, INTENT blocks replay.
          record.phase='RUNNING';record.pid=child.pid;record.spawnObservedAt=now();
          receipt=atomicJson(marker,{...record}).catch(()=>{child.kill();finish({phase:'UNCERTAIN',code:null,error:'CHILD_RECEIPT_FAILED'});});
        });
        child.on('close',code=>finish({phase:'EXITED',code,error:code===0&&!limitHit?null:'PREPARATION_FAILED'}));
      });
      await writes;await handle.sync();
      Object.assign(record,completion,{finishedAt:now()});
      await atomicJson(marker,record);
      if(completion.phase==='UNCERTAIN')fail(completion.error,'A preparation process did not produce a confirmed completion.',
        'Inspect its private receipt and exact processes. Do not retry or delete the marker blindly.',25);
      if(writeFailed)fail('PRIVATE_LOG_FAILED','The private preparation log could not be completely written.',
        'Inspect storage health and the process completion receipt before retrying.',24);
      if(completion.error)fail(completion.error,`The ${label} preparation step did not pass.`,
        'Read its private local log. Completed ordinary preparation can resume, but no application operation is replayed.',24);
      return log;
    } finally {await writes;await handle.close();}
  }
  async prepareDependencies(state) {
    const env={npm_config_cache:path.join(state.plan.installRoot,'npm-cache'),npm_config_userconfig:path.join(state.runtimeRoot,'.npmrc-empty'),
      npm_config_globalconfig:path.join(state.runtimeRoot,'.npmrc-empty-global'),DESKTOP_COMMANDER_DISABLE_TELEMETRY:'1'};
    for(const p of [env.npm_config_userconfig,env.npm_config_globalconfig])if(!(await exists(p)))await fs.writeFile(p,'',{flag:'wx'});
    await this.native(state,'npm-ci',state.environment.node,[state.environment.npmCli,'ci','--ignore-scripts','--no-audit','--no-fund','--registry=https://registry.npmjs.org'],{env});
    await this.native(state,'ripgrep',state.environment.node,[state.environment.npmCli,'rebuild','@vscode/ripgrep','--no-audit','--no-fund'],{env});
    await this.native(state,'private-config',state.environment.node,[path.join(state.runtimeRoot,'setup.mjs'),path.join(state.plan.stateRoot,'settings.json')],{env});
  }
  prepareTunnel(state,policy){return this.helper('prepare-tunnel',{stateFile:path.join(state.plan.stateRoot,'install.json'),policy},180000);}
  async qualify(state) {
    await this.native(state,'unit-tests',state.environment.node,['--test','--test-concurrency=1','security.test.mjs','modern.test.mjs','catalog.test.mjs','discovery.integration.test.mjs','scripts/tests/installer.test.mjs','scripts/tests/roots.test.mjs','scripts/tests/gui.test.mjs'],{timeout:240000});
    await this.native(state,'windows-helper-tests',state.environment.pwsh,['-NoProfile','-NonInteractive','-File',path.join(state.runtimeRoot,'scripts/tests/windows-helper.test.ps1')],{timeout:60000});
    await this.native(state,'high-dpi-tests',state.environment.windowsPowerShell,['-NoProfile','-STA','-File',path.join(state.runtimeRoot,'scripts/tests/gui-dpi.test.ps1')],{timeout:30000});
    const target=path.join(state.runtimeRoot,'ACCEPTANCE.json');
    if(await exists(target))await fs.rename(target,path.join(state.plan.stateRoot,'logs','previous-acceptance-'+Date.now()+'.json'));
    const started=now();
    await this.native(state,'acceptance',state.environment.node,['acceptance.mjs'],{timeout:240000});
    const report=await readJson(target);
    return {passed:report.result==='PASS_LOCAL_ACCEPTANCE'&&report.host===state.plan.binding.host&&report.at>=started,
      acceptancePasses:report.passCount,acceptanceFailures:report.failCount,focusedSuitePassed:true,nativeHelperSuitePassed:true};
  }
}
