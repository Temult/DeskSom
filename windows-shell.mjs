// Windows Store execution aliases launch through CreateProcess but deny ordinary
// stat/realpath access. Resolve the installed binary through a fixed known alias,
// not a work-directory executable or a caller-supplied command.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
let cached=null;
const regular=(file,io)=>{try{return io.statSync(file).isFile()}catch{return false}};
export function resolvePowerShell7({env=process.env,io=fs,run=execFileSync}={}){
 const program=env.ProgramFiles??env.PROGRAMFILES,local=env.LOCALAPPDATA;
 if(!program||!local||!path.win32.isAbsolute(program)||!path.win32.isAbsolute(local))throw Error('POWERSHELL_INSTALLATION_UNAVAILABLE');
 const candidates=[path.win32.join(program,'PowerShell','7','pwsh.exe'),
  path.win32.join(local,'Microsoft','WindowsApps','Microsoft.PowerShell_8wekyb3d8bbwe','pwsh.exe'),
  path.win32.join(local,'Microsoft','WindowsApps','pwsh.exe')];
 const command="[Console]::Write((@{path=(Join-Path $PSHOME 'pwsh.exe');version=$PSVersionTable.PSVersion.ToString()}|ConvertTo-Json -Compress))";
 for(const candidate of candidates){
  try{
   const answer=JSON.parse(run(candidate,['-NoProfile','-NonInteractive','-Command',command],
    {encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:4096,stdio:['ignore','pipe','pipe']}));
   const resolved=path.win32.normalize(answer.path??''),relative=path.win32.relative(program,resolved);
   const known=/^PowerShell\\7\\pwsh\.exe$/i.test(relative)||
    /^WindowsApps\\Microsoft\.PowerShell_[A-Za-z0-9._-]+\\pwsh\.exe$/i.test(relative);
   const parts=String(answer.version).split('.').map(Number);
   if(!known||!path.win32.isAbsolute(resolved)||!parts.every(Number.isInteger)||parts.length<3||
    !(parts[0]>7||(parts[0]===7&&parts[1]>=4))||!regular(resolved,io))continue;
   return resolved;
  }catch{/* A missing fixed installation candidate is not permission to search CWD. */}
 }
 throw Error('POWERSHELL_INSTALLATION_UNAVAILABLE');
}
export function prepareShellArguments(name,args,{platform=process.platform,resolve=resolvePowerShell7,io=fs}={}){
 if(platform!=='win32'||name!=='start_process'||
  (args.shell!==undefined&&!/^pwsh(?:\.exe)?$/i.test(args.shell)))return args;
 if(!cached||!regular(cached,io))cached=resolve();
 return {...args,shell:cached};
}
