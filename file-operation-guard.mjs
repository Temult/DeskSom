// Compatibility guard for upstream 0.2.52, inspired by DesktopCommander PR #759.
// Check the location a future write actually reaches, including dangling links.
// This is not a terminal sandbox or atomic protection against hostile path swaps.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const fields=new Map([
 ['write_file',['path']],['create_directory',['path']],['edit_block',['file_path']],
 ['move_file',['source','destination']],['write_pdf',['path','outputPath']]
]);
function within(root,target){
 const rel=path.relative(root,target);
 return rel===''||(!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep));
}
export async function resolveProspectivePath(absolute,{io=fs}={}){
 let followed=0,steps=0;
 async function resolve(current){
  if(++steps>512)throw Error('FILE_GUARD_PATH_TOO_COMPLEX');
  try{return await io.realpath(current)}catch(e){if(e.code!=='ENOENT')throw e}
  const parent=path.dirname(current);
  if(parent===current)return current;
  const resolvedParent=await resolve(parent),candidate=path.join(resolvedParent,path.basename(current));
  let stat;try{stat=await io.lstat(candidate)}catch(e){if(e.code!=='ENOENT')throw e;return candidate}
  if(!stat.isSymbolicLink())return candidate;
  if(++followed>40)throw Error('FILE_GUARD_LINK_LOOP');
  const target=await io.readlink(candidate);
  return resolve(path.resolve(resolvedParent,target));
 }
 return resolve(absolute);
}
export async function validateFileOperation(name,args,cfg){
 const wanted=fields.get(name);if(!wanted)return;
 if(!args||typeof args!=='object')throw Error('FILE_GUARD_INVALID_ARGUMENTS');
 const paths=[];
 for(const key of wanted){
  const value=args[key];
  if(value===undefined&&key==='outputPath')continue;
  if(typeof value!=='string'||!value||value.includes('\0'))throw Error('FILE_GUARD_INVALID_PATH');
  paths.push(value);
 }
 const roots=[];
 for(const r of cfg.allowedDirectories??[]){try{roots.push(await fs.realpath(r))}catch(e){if(e.code!=='ENOENT')throw Error('FILE_GUARD_ROOT_UNAVAILABLE')}}
 if(!roots.length)throw Error('FILE_GUARD_NO_AVAILABLE_ROOTS');
 for(const input of paths){
  const expanded=input==='~'?os.homedir():input.startsWith('~/')||input.startsWith('~\\')?path.join(os.homedir(),input.slice(2)):input;
  const absolute=path.resolve(cfg.workDir,expanded);
  let target;try{target=await resolveProspectivePath(absolute)}catch{throw Error('FILE_GUARD_PATH_UNRESOLVED')}
  if(!roots.some(root=>within(root,target)))throw Error('FILE_GUARD_OUTSIDE_APPROVED_ROOTS');
 }
}
