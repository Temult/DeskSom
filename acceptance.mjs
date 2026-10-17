import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const fixture=await fs.mkdtemp(path.join(root,'acceptance-'));
const report={host:os.hostname(),at:new Date().toISOString(),fixture,checks:[],failures:[],remoteChatGPT:'NOT_TESTED_NO_NEW_TUNNEL',paidInference:false};
const config={expectedHost:os.hostname(),port:0,stateDir:path.join(fixture,'private-state'),workDir:fixture,allowedDirectories:[fixture]};
const configPath=path.join(fixture,'settings.json');
await fs.writeFile(configPath,JSON.stringify(config));
execFileSync(process.execPath,[path.join(root,'setup.mjs'),configPath],{stdio:'pipe'});
const token=randomBytes(32).toString('hex');
const statusFile=path.join(fixture,'status.json');
let proc,base,firstBoot,clients=[]; const logs=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function check(name,fn){try{await fn();report.checks.push({name,result:'PASS'});console.log('PASS '+name);}catch(e){report.failures.push({name,message:e.message});console.log('FAIL '+name+': '+e.message);}}
async function start(){
 await fs.rm(statusFile,{force:true});
 proc=spawn(process.execPath,[path.join(root,'broker.mjs'),'--config',configPath,'--port','0','--status-file',statusFile],{env:{...process.env,DESKSOM_HTTP_TOKEN:token},stdio:['ignore','pipe','pipe'],windowsHide:true});
 proc.stderr.on('data',b=>logs.push(b.toString()));
 for(let i=0;i<900;i++){if(proc.exitCode!==null)throw new Error('Broker exited '+proc.exitCode+' '+logs.join('').slice(-3000));try{const s=JSON.parse(await fs.readFile(statusFile,'utf8'));base=s.address;return s;}catch{}await sleep(100);}
 throw new Error('Broker startup deadline exceeded');
}
async function stop(){for(const c of clients)await c.close().catch(()=>{});clients=[];if(proc&&proc.exitCode===null){proc.kill();await Promise.race([new Promise(r=>proc.once('exit',r)),sleep(5000)]);}}
async function connect(){const c=new Client({name:'desksom-independent-acceptance',version:'1.0.0'},{capabilities:{}});await c.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+token}}}));clients.push(c);return c;}
const text=r=>(r.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
async function call(c,name,args={}){const r=await c.callTool({name,arguments:args},undefined,{timeout:30000});assert.notEqual(r.isError,true,`${name}: ${text(r)}`);return r;}
try{
 const s=await start();firstBoot=s.bootId;
 await check('loopback-only listener',async()=>assert(base.startsWith('http://127.0.0.1:')));
 await check('unauthenticated tool access rejected',async()=>assert.equal((await fetch(base+'/mcp',{method:'POST',body:'{}'})).status,401));
 await check('wrong token rejected',async()=>assert.equal((await fetch(base+'/mcp',{method:'POST',headers:{Authorization:'Bearer wrong'},body:'{}'})).status,401));
 await check('hostile browser origin rejected',async()=>assert.equal((await fetch(base+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,Origin:'https://evil.example'},body:'{}'})).status,403));
 await check('oversized body rejected before dispatch',async()=>assert.equal((await fetch(base+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token},body:'x'.repeat(262145)})).status,413));
 await check('malformed JSON rejected',async()=>assert.equal((await fetch(base+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token},body:'{'})).status,400));
 await check('non-POST MCP requests rejected',async()=>assert.equal((await fetch(base+'/mcp',{headers:{Authorization:'Bearer '+token}})).status,405));
 const c=await connect();
 await check('official SDK initialization and tool discovery',async()=>{const tools=(await c.listTools()).tools;assert(tools.length>=20);assert(tools.some(t=>t.name==='write_file'));assert(tools.some(t=>t.name==='start_process'));assert(!tools.some(t=>t.name==='set_config_value'));report.tools=tools.map(t=>t.name);});
 await check('explicit target identity and private relay status',async()=>{const r=JSON.parse(text(await call(c,'desksom_status')));assert.equal(r.host,os.hostname());assert.equal(r.bootId,firstBoot);assert.equal(r.hostedDesktopCommanderRelay,false);report.catalogSha256=r.catalogSha256;});
 const f=path.join(fixture,'roundtrip.txt');const data='DeskSom UTF-8 round trip: café, 日本語, ✔\nsecond line\n';
 await check('write and independent SHA-256 round trip',async()=>{await call(c,'write_file',{path:f,content:data,mode:'rewrite'});const b=await fs.readFile(f);assert.equal(b.toString('utf8'),data);report.roundtripSha256=createHash('sha256').update(b).digest('hex');});
 await check('read round trip',async()=>assert(text(await call(c,'read_file',{path:f})).includes(data.trim())));
 await check('surgical edit',async()=>{await call(c,'edit_block',{file_path:f,old_string:'second line',new_string:'replacement line',expected_replacements:1});assert((await fs.readFile(f,'utf8')).includes('replacement line'));});
 await check('create and list directory',async()=>{const d=path.join(fixture,'created');await call(c,'create_directory',{path:d});assert(text(await call(c,'list_directory',{path:fixture,depth:1})).includes('created'));});
 await check('outside-root file reads denied',async()=>{const r=await c.callTool({name:'read_file',arguments:{path:'C:\\Windows\\win.ini'}});assert(r.isError===true||/denied|not allowed|outside|access.*restricted/i.test(text(r)));});
 await check('search tool executes',async()=>{const r=await call(c,'start_search',{path:fixture,pattern:'roundtrip.txt',searchType:'files',timeout_ms:1000});const out=text(r);assert(/roundtrip|search|session/i.test(out));report.searchOutput=out.slice(0,1200);});
 await check('PowerShell execution',async()=>assert(text(await call(c,'start_process',{command:"Write-Output 'DESKSOM_EXEC_PASS'",shell:'pwsh.exe',timeout_ms:2000})).includes('DESKSOM_EXEC_PASS')));
 let pid;
 await check('long process returns early with PID',async()=>{const out=text(await call(c,'start_process',{command:"Write-Output 'DESKSOM_BEGIN'; Start-Sleep -Seconds 5; Write-Output 'DESKSOM_DONE'",shell:'pwsh.exe',timeout_ms:500}));const m=out.match(/PID\s*:?\s*(\d+)/i);assert(m,'No PID in '+out);pid=Number(m[1]);report.fixtureProcessPid=pid;});
 if(pid){await c.close();clients=clients.filter(x=>x!==c);await sleep(5500);const c2=await connect();await check('process output survives HTTP client reconnect',async()=>assert(text(await call(c2,'read_process_output',{pid,timeout_ms:1000})).includes('DESKSOM_DONE')));}
 await check('concurrent clients share one engine',async()=>{const cs=await Promise.all(Array.from({length:4},()=>connect()));const rs=await Promise.all(cs.map(x=>call(x,'desksom_status')));assert(rs.every(r=>JSON.parse(text(r)).bootId===firstBoot));await Promise.all(cs.map(x=>call(x,'get_file_info',{path:f})));});
 const c3=await connect();
 await check('disabled configuration mutation fails closed',async()=>{const r=await c3.callTool({name:'set_config_value',arguments:{key:'allowedDirectories',value:[]}});assert.equal(r.isError,true);assert(text(r).includes('TOOL_NOT_EXPOSED'));});
 await check('unknown tool does not disrupt service',async()=>{const r=await c3.callTool({name:'__nonexistent',arguments:{}});assert.equal(r.isError,true);assert(JSON.parse(text(await call(c3,'desksom_status'))).ready);});
 await check('bounded output pagination',async()=>{const many=path.join(fixture,'many-lines.txt');await fs.writeFile(many,Array.from({length:200},(_,i)=>'LINE_'+i).join('\n'));const out=text(await call(c3,'read_file',{path:many,offset:50,length:5}));assert(out.includes('LINE_50'));assert(!out.includes('LINE_60'));});
 await check('fixture process termination',async()=>{const out=text(await call(c3,'start_process',{command:'Start-Sleep -Seconds 25',shell:'pwsh.exe',timeout_ms:500}));const m=out.match(/PID\s*:?\s*(\d+)/i);assert(m);await call(c3,'force_terminate',{pid:Number(m[1])});});
 await check('direct stateless MCP tool dispatch',async()=>{const r=await fetch(base+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:100,method:'tools/call',params:{name:'desksom_status',arguments:{}}})});assert.equal(r.status,200);const j=await r.json();assert(j.result);});
 await stop();const next=await start();
 await check('restart changes engine generation and preserves files',async()=>{assert.notEqual(next.bootId,firstBoot);assert((await fs.readFile(f,'utf8')).includes('replacement line'));const c4=await connect();assert(JSON.parse(text(await call(c4,'desksom_status'))).ready);});
 await stop();
 await check('local stdio plugin transport',async()=>{const local=new Client({name:'desksom-local-plugin-test',version:'1.0.0'},{capabilities:{}});const st=new StdioClientTransport({command:process.execPath,args:[path.join(root,'broker.mjs'),'--stdio','--config',configPath],env:{...process.env},stderr:'pipe'});await local.connect(st);assert.equal(JSON.parse(text(await call(local,'desksom_status'))).mode,'stdio');await local.close();});
}catch(e){report.failures.push({name:'acceptance harness',message:e.message});console.log('HARNESS_FAIL '+e.message);}
finally{await stop();report.result=report.failures.length?'REPAIR_REQUIRED':'PASS_LOCAL_ACCEPTANCE';report.passCount=report.checks.length;report.failCount=report.failures.length;await fs.writeFile(path.join(root,'ACCEPTANCE.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(fixture,'engine-stderr.log'),logs.join(''));console.log(JSON.stringify({result:report.result,passCount:report.passCount,failCount:report.failCount,report:path.join(root,'ACCEPTANCE.json')}));process.exit(report.failures.length?1:0);}
