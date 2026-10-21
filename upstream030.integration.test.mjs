// Real isolated broker coverage for changed upstream 0.3.0 document/preload paths.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import fss from 'node:fs';import os from 'node:os';import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';import {randomBytes} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {PDFDocument,StandardFonts} from 'pdf-lib';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const text=r=>(r.content??[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
test('upstream 0.3.0 integration: preload, Office/PDF, removed tool and terminal aliases',
 {timeout:90000},async()=>{
 const source=import.meta.dirname,base=fss.realpathSync.native(await fs.mkdtemp(path.join(os.tmpdir(),'desksom-030-')));
 const work=path.join(base,'work'),state=path.join(base,'private');await fs.mkdir(work);await fs.mkdir(state);
 const config=path.join(base,'settings.json'),statusFile=path.join(base,'broker.json'),token=randomBytes(32).toString('hex');
 await fs.writeFile(config,JSON.stringify({expectedHost:os.hostname(),stateDir:state,workDir:work,allowedDirectories:[work]}));
 execFileSync(process.execPath,[path.join(source,'setup.mjs'),config],{windowsHide:true,timeout:20000,stdio:'pipe'});
 const child=spawn(process.execPath,[path.join(source,'broker.mjs'),'--config',config,'--port','0','--status-file',statusFile],
  {windowsHide:true,cwd:source,env:{...process.env,DESKSOM_HTTP_TOKEN:token},stdio:['ignore','pipe','pipe']});
 child.stdout.resume();let stderr='';child.stderr.on('data',x=>{stderr=(stderr+x).slice(-3000)});
 const client=new Client({name:'rc15-upstream-regression',version:'1'},{capabilities:{}});
 let success=false;
 try{
  let observed;const until=Date.now()+25000;
  while(Date.now()<until){if(child.exitCode!==null)throw Error('Fixture broker exited '+stderr);try{observed=JSON.parse(await fs.readFile(statusFile,'utf8'));break}catch{}await sleep(50)}
  assert.ok(observed?.address,'No broker readiness');
  await client.connect(new StreamableHTTPClientTransport(new URL(observed.address+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+token}}}));
  const call=async(name,args)=>{const r=await client.callTool({name,arguments:args},undefined,{timeout:20000});assert.notEqual(r.isError,true,name+': '+text(r));return r};
  const catalog=(await client.listTools()).tools;assert.equal(catalog.length,24);assert.equal(catalog.some(t=>t.name==='get_prompts'),false);
  const id=await call('desksom_status',{});assert.equal(id.structuredContent.upstreamVersion,'0.3.0');
  // Read-only readiness checks may be repeated; no write below is replayed.
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
  for(const label of ['RC15 PDF FIRST','RC15 PDF SECOND'])pdf.addPage().drawText(label,{x:35,y:100,font,size:12});
  const sourcePdf=path.join(work,'two-pages.pdf');await fs.writeFile(sourcePdf,await pdf.save());
  let pdfRead;for(let i=0;i<30;i++){pdfRead=await client.callTool({name:'read_file',arguments:{path:sourcePdf}},undefined,{timeout:10000});if(!/still loading/i.test(text(pdfRead)))break;await sleep(100)}
  assert.notEqual(pdfRead.isError,true,text(pdfRead));assert.match(text(pdfRead),/RC15 PDF FIRST/);
  const editedPdf=path.join(work,'one-page.pdf');await call('write_pdf',{path:sourcePdf,outputPath:editedPdf,content:[{type:'delete',pageIndexes:[0]}]});
  assert.equal((await PDFDocument.load(await fs.readFile(editedPdf))).getPageCount(),1);
  assert.equal((await PDFDocument.load(await fs.readFile(sourcePdf))).getPageCount(),2);
  const spreadsheet=path.join(work,'smoke.xlsx');await call('write_file',{path:spreadsheet,content:JSON.stringify([['Name','Count'],['rc15',3]])});
  assert.match(text(await call('read_file',{path:spreadsheet})),/rc15/);
  const document=path.join(work,'smoke.docx');await call('write_file',{path:document,content:'# Integration\n\nRC15 DOCX roundtrip.'});
  assert.match(text(await call('read_file',{path:document})),/RC15 DOCX roundtrip/);
  assert.match(text(await call('start_process',{command:"Write-Output 'RC15_DEFAULT_SHELL_OK'",timeout_ms:2000})),/RC15_DEFAULT_SHELL_OK/);
  assert.match(text(await call('start_process',{command:"Write-Output 'RC15_BARE_SHELL_OK'",shell:'pwsh.exe',timeout_ms:2000})),/RC15_BARE_SHELL_OK/);
  const legacy=await client.callTool({name:'get_prompts',arguments:{promptId:'anything'}});assert.equal(legacy.isError,true);assert.match(text(legacy),/TOOL_NOT_EXPOSED/);
  console.log(JSON.stringify({status:'UPSTREAM030_INTEGRATED_DOCUMENTS_PASS',tools:24,engine:'0.3.0',pdfReadEdit:true,xlsxRoundtrip:true,docxRoundtrip:true,defaultAndBarePowerShell:true,removedLegacyToolRejected:true,productionModified:false}));
  success=true;
 }finally{
  await client.close().catch(()=>{});
  if(child.exitCode===null&&child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill();await Promise.race([exited,sleep(3000)])}
  if(success)await fs.rm(base,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  else console.warn('Preserved failing document fixture:',base,stderr.slice(-900));
 }
});
