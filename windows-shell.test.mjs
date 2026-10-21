import test from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';import fs from 'node:fs';
import {resolvePowerShell7,prepareShellArguments} from './windows-shell.mjs';
const env={ProgramFiles:'C:\\Program Files',LOCALAPPDATA:'C:\\Users\\Fixture\\AppData\\Local'};
const real='C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.6.7.0_x64__8wekyb3d8bbwe\\pwsh.exe';
test('fixed Store alias resolves actual installed binary, never the project directory',()=>{
 const calls=[];const result=resolvePowerShell7({env,io:{statSync:p=>({isFile:()=>p===real})},run:(exe,args,options)=>{
  calls.push(exe);assert.equal(path.win32.isAbsolute(exe),true);assert.equal(args[0],'-NoProfile');assert.equal(options.timeout,5000);
  if(exe.includes('PowerShell\\7'))throw Object.assign(Error('not installed'),{code:'ENOENT'});
  return JSON.stringify({path:real,version:'7.6.7'});
 }});
 assert.equal(result,real);assert.equal(calls.length,2);assert.match(calls[1],/Microsoft\.PowerShell_8wekyb3d8bbwe/);
});
test('misleading shell probe output cannot substitute a work-folder program',()=>{
 for(const reply of [{path:'C:\\Work\\pwsh.exe',version:'7.6.7'},{path:real,version:'5.1.0'},{path:'pwsh.exe',version:'7.6.7'}])
  assert.throws(()=>resolvePowerShell7({env,io:{statSync:()=>({isFile:()=>true})},run:()=>JSON.stringify(reply)}),/INSTALLATION_UNAVAILABLE/);
});
test('only default or bare PowerShell7 requests are rewritten; inputs remain untouched',()=>{
 const input={command:'Write-Output fixture',shell:'pwsh.exe',timeout_ms:1500};
 const out=prepareShellArguments('start_process',input,{platform:'win32',resolve:()=>real,io:{statSync:()=>{throw Error('cache absent')}}});
 assert.equal(out.shell,real);assert.equal(input.shell,'pwsh.exe');assert.equal(out.command,input.command);
 for(const shell of ['powershell.exe','cmd.exe','C:\\Tools\\custom.exe']){
  const value={command:'fixture',shell};assert.equal(prepareShellArguments('start_process',value,{platform:'win32'}),value);
 }
 assert.equal(prepareShellArguments('read_process_output',input,{platform:'win32'}),input);
});
test('normal installed Windows PowerShell resolves to a regular absolute executable',{
 skip:process.platform!=='win32',timeout:16000},()=>{
 const resolved=resolvePowerShell7();assert.equal(path.win32.isAbsolute(resolved),true);assert.equal(fs.statSync(resolved).isFile(),true);
});
