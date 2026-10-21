import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const src=path.dirname(fileURLToPath(import.meta.url));
const execFileAsync=promisify(execFile);
const version='2026-07-28';
const meta={'io.modelcontextprotocol/protocolVersion':version,
  'io.modelcontextprotocol/clientInfo':{name:'project-inspect-isolated',version:'1'},
  'io.modelcontextprotocol/clientCapabilities':{}};
test('feature off has 25 tools, feature on exposes bounded read-only inspect_project on disposable HTTP fixture', {timeout:200000}, async t=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'desksom-inspect-http-'));
  const repo=path.join(temp,'repo'); await fs.mkdir(repo);
  await execFileAsync('git',['-C',repo,'init','-q'],{timeout:8000,windowsHide:true});
  await fs.writeFile(path.join(repo,'README.md'),'fixture read-only target\n');
  await fs.writeFile(path.join(repo,'tiny.ts'),'export const n=1\n');
  const children=[];
  t.after(async()=>{
    for(const child of children) if(child.exitCode===null) child.kill();
    await Promise.all(children.map(child=>child.exitCode!==null?Promise.resolve():
      Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,2500))])));
    await fs.rm(temp,{recursive:true,force:true,maxRetries:7,retryDelay:150});
  });
  async function instance(enabled) {
    const token=randomBytes(32).toString('hex');
    const state=path.join(temp,enabled?'enabled':'disabled');
    await fs.mkdir(state);
    const config={expectedHost:os.hostname(),stateDir:state,workDir:temp,allowedDirectories:[temp],
      instance:enabled?'inspect-test-on':'inspect-test-off',port:0,enableProjectInspect:enabled};
    const conf=path.join(state,'settings.json');await fs.writeFile(conf,JSON.stringify(config));
    const child=spawn(process.execPath,[path.join(src,'broker.mjs'),'--config',conf,'--port','0'],
      {cwd:src,env:{...process.env,DESKSOM_HTTP_TOKEN:token,DESKTOP_COMMANDER_DISABLE_TELEMETRY:'1'},
       windowsHide:true,stdio:['ignore','pipe','pipe']});
    children.push(child);
    let stdout='',stderr='',done=false;
    const ready=new Promise((resolve,reject)=>{
      child.stdout.on('data',buf=>{stdout+=buf.toString();let pos=stdout.indexOf('\n');
        if(pos>=0&&!done){done=true;try{resolve(JSON.parse(stdout.slice(0,pos)))}catch(e){reject(e)}}});
      child.stderr.on('data',buf=>{stderr=(stderr+buf.toString()).slice(-1200)});
      child.on('exit',code=>{if(!done){done=true;reject(new Error('BROKER_EXIT '+code+' '+stderr))}});
    });
    let timeoutHandle;
    const timeout=new Promise((_,reject)=>{timeoutHandle=setTimeout(()=>reject(new Error('BROKER_START_TIMEOUT '+stderr)),65000);});
    let startup;
    try { startup=await Promise.race([ready,timeout]); } finally { clearTimeout(timeoutHandle); }
    async function call(method,params={},auth=true){
      const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream',
        'Mcp-Protocol-Version':version,'Mcp-Method':method};
      if(auth)headers.Authorization='Bearer '+token;
      if(method==='tools/call')headers['Mcp-Name']=params.name;
      const body={jsonrpc:'2.0',id:10,method,params:{...params,_meta:meta}};
      const res=await fetch(startup.address+'/mcp',{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
      return {code:res.status,data:await res.json()};
    }
    return {call,child};
  }
  const off=await instance(false);
  assert.equal((await off.call('tools/list',{},false)).code,401);
  const offTools=(await off.call('tools/list')).data.result.tools;
  assert.equal(offTools.length,24);
  assert.ok(!offTools.find(x=>x.name==='inspect_project'));
  off.child.kill();
  const on=await instance(true);
  const list=(await on.call('tools/list')).data.result.tools;
  assert.equal(list.length,25);
  assert.equal(list.find(x=>x.name==='inspect_project').annotations.readOnlyHint,true);
  assert.equal(list.find(x=>x.name==='inspect_project').inputSchema.required[0],'path');
  const identity=(await on.call('tools/call',{name:'desksom_status',arguments:{}})).data.result.structuredContent;
  assert.equal(identity.advertisedToolCount,25);
  const positive=(await on.call('tools/call',{name:'inspect_project',arguments:{path:repo}})).data.result;
  assert.notEqual(positive.isError,true);
  assert.equal(positive.structuredContent.git.detected,true);
  assert.equal(positive.structuredContent.projectHints.commandsExecuted,false);
  assert.equal(positive.structuredContent.mode,'READ_ONLY_ADVISORY');
  const denied=(await on.call('tools/call',{name:'inspect_project',arguments:{path:os.homedir()}})).data.result;
  assert.equal(denied.isError,true);
  assert.match(denied.content[0].text,/PROJECT_OUTSIDE_APPROVED_ROOTS/);
  const extra=(await on.call('tools/call',{name:'inspect_project',arguments:{path:repo,unexpected:'extra'}})).data.result;
  assert.equal(extra.isError,true);
  assert.match(extra.content[0].text,/PROJECT_INVALID_ARGUMENTS/);
  console.log(JSON.stringify({result:'OPTIONAL_INSPECT_MCP_HTTP_PASS',disabled:25,enabled:26,productionAffected:false}));
});
