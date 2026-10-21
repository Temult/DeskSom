// Experimental READ-ONLY advisory project snapshot. Default-off broker feature.
// No project scripts, shell interpolation, dependency installation or workflow authority.
// Git metadata is authorized via filesystem-only preflight BEFORE any Git process.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {validateGitDataSources} from './project-inspect-git-policy.mjs';

const MAX_TRACKED_OUTPUT=384*1024,MAX_STATUS_OUTPUT=160*1024,MAX_LOG_OUTPUT=8*1024;
const MAX_RETURN=12*1024, TIMEOUT_MS=6000,MAX_HINT_BYTES=65536,MAX_CONCURRENT_GIT=3;
const SAFE_DOCS=['README.md','AGENTS.md','CONTRIBUTING.md','ARCHITECTURE.md','package.json',
 'pyproject.toml','requirements.txt','go.mod','Cargo.toml','pom.xml','build.gradle',
 'Makefile','CMakeLists.txt','.github'];
const SECRET_SEGMENT=/(^|[._-])(secret|credential|private|token|password|keyfile|api[-_]?key)([._-]|$)/i;
const EXT_LANGUAGE=Object.freeze({
 '.mjs':'JavaScript','.cjs':'JavaScript','.js':'JavaScript','.jsx':'JavaScript',
 '.ts':'TypeScript','.tsx':'TypeScript','.py':'Python','.rs':'Rust','.go':'Go',
 '.cs':'C#','.java':'Java','.cpp':'C++','.cc':'C++','.cxx':'C++','.h':'C/C++',
 '.c':'C','.ps1':'PowerShell','.sh':'Shell','.rb':'Ruby','.php':'PHP',
 '.swift':'Swift','.kt':'Kotlin','.dart':'Dart','.vue':'Vue','.svelte':'Svelte'
});
function inside(root,target) {
 const r=process.platform==='win32'?root.toLowerCase():root,t=process.platform==='win32'?target.toLowerCase():target;
 const rel=path.relative(r,t);
 return rel===''||(rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel));
}
function codeError(code){return new Error(code);}
function clean(v,n=160){return String(v).replace(/[\x00-\x1f\x7f]/g,' ').slice(0,n);}
function failure(code){return {available:false,partial:false,code,output:''};}
async function availableRealRoots(roots) {
 if(!Array.isArray(roots)||roots.length===0)throw codeError('NO_APPROVED_ROOTS');
 const out=[];
 for(const root of roots){if(typeof root!=='string'||!path.isAbsolute(root))continue;
   try{out.push(await fs.realpath(root));}catch{/* stale roots grant nothing */}}
 if(out.length===0)throw codeError('NO_AVAILABLE_APPROVED_ROOTS');
 return out;
}
export async function authorizeProjectPath(requested,allowedRoots) {
 if(typeof requested!=='string'||!path.isAbsolute(requested)||requested.includes('\0')||requested.length>4096)
   throw codeError('INVALID_ABSOLUTE_DIRECTORY');
 let resolved;
 try{resolved=await fs.realpath(requested);}catch(e){
   throw codeError(e?.code==='ENOENT'?'PROJECT_NOT_FOUND':'PROJECT_PATH_UNAVAILABLE');}
 const stat=await fs.stat(resolved);
 if(!stat.isDirectory())throw codeError('PROJECT_NOT_DIRECTORY');
 const roots=await availableRealRoots(allowedRoots);
 if(!roots.some(root=>inside(root,resolved)))throw codeError('PROJECT_OUTSIDE_APPROVED_ROOTS');
 return {canonicalPath:resolved,canonicalRoots:roots};
}
function approved(p,roots){return roots.some(root=>inside(root,p));}
async function canonicalMetadata(raw,base,roots) {
 const absolute=path.isAbsolute(raw)?raw:path.resolve(base,raw);
 const resolved=await fs.realpath(absolute);
 if(!approved(resolved,roots))throw codeError('GIT_METADATA_OUTSIDE_APPROVED_ROOTS');
 if(!(await fs.stat(resolved)).isDirectory())throw codeError('GIT_METADATA_INVALID');
 return resolved;
}
// All preflight metadata files (.git gitfiles and commondir) take this same
// lstat -> canonical scope -> open -> fstat route. Never open a symlink before
// verifying scope. Concurrent path swaps remain an advisory TOCTOU limit.
async function readScopedMetadataFile(file,roots,max=4096){
 if(!Number.isInteger(max)||max<1)throw codeError('GIT_METADATA_INVALID');
 const requested=path.resolve(file);
 if(!approved(requested,roots))throw codeError('GIT_METADATA_OUTSIDE_APPROVED_ROOTS');
 let before;
 try{before=await fs.lstat(requested);}
 catch(error){if(error?.code==='ENOENT')return null;throw codeError('GIT_METADATA_UNAVAILABLE');}
 if(before.isSymbolicLink())throw codeError('GIT_METADATA_REPARSE_DENIED');
 if(!before.isFile()||before.size>max)throw codeError('GIT_METADATA_INVALID');
 let canonical;
 try{canonical=await fs.realpath(requested);}
 catch{throw codeError('GIT_METADATA_UNAVAILABLE');}
 if(!approved(canonical,roots))throw codeError('GIT_METADATA_OUTSIDE_APPROVED_ROOTS');
 let handle;
 try{
   handle=await fs.open(canonical,'r');
   const st=await handle.stat();
   if(!st.isFile()||st.size>max||st.size!==before.size||
      (before.ino&&st.ino&&before.ino!==st.ino)||
      (before.dev&&st.dev&&before.dev!==st.dev))
     throw codeError('GIT_METADATA_CHANGED');
   const b=Buffer.alloc(st.size);
   const {bytesRead}=await handle.read(b,0,st.size,0);
   if(bytesRead!==st.size)throw codeError('GIT_METADATA_CHANGED');
   return b.toString('utf8');
 }catch(error){
   if(error?.message?.startsWith('GIT_METADATA_'))throw error;
   throw codeError('GIT_METADATA_UNAVAILABLE');
 }finally{await handle?.close();}
}
// No external process is launched until a .git directory or gitfile has been
// discovered under an authorized root AND its admin/common dirs are authorized.
async function preflightGit(project,roots){
 const parentRoot=roots.filter(root=>inside(root,project)).sort((a,b)=>b.length-a.length)[0];
 let cursor=project;
 while(inside(parentRoot,cursor)) {
   const marker=path.join(cursor,'.git');
   let info;
   try{info=await fs.lstat(marker);}
   catch(e){if(e?.code==='ENOENT'){if(cursor===parentRoot)break;cursor=path.dirname(cursor);continue;}
     throw codeError('GIT_METADATA_UNAVAILABLE');}
   let gitDir;
   try{
     if(info.isFile()){
       const text=(await readScopedMetadataFile(marker,roots)).trim();
       const match=/^gitdir: (.+)$/i.exec(text);
       if(!match)throw codeError('GIT_METADATA_INVALID');
       gitDir=await canonicalMetadata(match[1],cursor,roots);
     } else if(info.isDirectory()||info.isSymbolicLink()) {
       gitDir=await canonicalMetadata(marker,cursor,roots);
     } else throw codeError('GIT_METADATA_INVALID');
     let commonDir=gitDir;
     const text=await readScopedMetadataFile(path.join(gitDir,'commondir'),roots);
     if(text!==null){
       const raw=text.trim();
       if(!raw||raw.includes('\0'))throw codeError('GIT_METADATA_INVALID');
       commonDir=await canonicalMetadata(raw,gitDir,roots);
     }
     // Deliberately limited to filesystem discovery; no Git data is read in the denied case.
     return {root:cursor,gitDir,commonDir,available:true};
   }catch(e){
     return {available:false,code:e?.message?.startsWith('GIT_')?e.message:'GIT_METADATA_UNAVAILABLE'};
   }
 }
 return {available:false,code:'GIT_ROOT_NOT_FOUND_WITHIN_APPROVED_ROOTS'};
}
export async function resolveTrustedGit(configured) {
 const defaultLocation=process.platform==='win32'
  ?path.join(process.env.ProgramFiles||'C:\\Program Files','Git','cmd','git.exe')
  :'/usr/bin/git';
 const chosen=configured??defaultLocation;
 if(typeof chosen!=='string'||!path.isAbsolute(chosen)||chosen.length>4096)throw codeError('GIT_EXECUTABLE_NOT_ABSOLUTE');
 let actual;
 try{actual=await fs.realpath(chosen);}catch{throw codeError('GIT_EXECUTABLE_UNAVAILABLE');}
 const st=await fs.lstat(actual);
 if(!st.isFile())throw codeError('GIT_EXECUTABLE_INVALID');
 return actual;
}
function childEnv(){
 // NO copied process.env. This prevents GIT_TRACE*, GIT_DIR, GIT_CONFIG_*
 // and other ambient Git redirectors from influencing child Git.
 const e={};
 for(const key of ['SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','HOMEDRIVE','HOMEPATH','APPDATA','LOCALAPPDATA']){
   if(typeof process.env[key]==='string')e[key]=process.env[key];
 }
 // Only the installed Git binary is launched by absolute path. Git-for-Windows
 // internally locates its shipped helpers; preserve no repo-controlled PATH.
 e.GIT_OPTIONAL_LOCKS='0';e.GIT_TERMINAL_PROMPT='0';e.GIT_NO_LAZY_FETCH='1';
 e.GIT_CONFIG_NOSYSTEM='1';e.GIT_CONFIG_GLOBAL=process.platform==='win32'?'NUL':'/dev/null';
 e.GIT_CONFIG_SYSTEM=process.platform==='win32'?'NUL':'/dev/null';e.GIT_EXTERNAL_DIFF='0';
 return e;
}
let active=0;
const queue=[];
async function gate(fn){
 if(active>=MAX_CONCURRENT_GIT)await new Promise(resolve=>queue.push(resolve));
 active++;
 try{return await fn();}finally{active--;queue.shift()?.();}
}
function runGit(gitExecutable,cwd,repoRoot,args,maxBytes){
 return gate(()=>new Promise(resolve=>{
   let chunks=[],size=0,limited=false,done=false,timer,child;
   const finish=(v)=>{if(done)return;done=true;clearTimeout(timer);resolve(v);};
   try{child=spawn(gitExecutable,[
     '-c','core.fsmonitor=false','-c','core.hooksPath=NUL','-c','diff.external=',
     '-c',`core.worktree=${repoRoot}`,'-c','submodule.recurse=false',
     '-c','status.submoduleSummary=false','-C',cwd,...args
   ],{cwd,windowsHide:true,shell:false,stdio:['ignore','pipe','ignore'],env:childEnv()});}
   catch{return finish(failure('GIT_START_FAILED'));}
   timer=setTimeout(()=>{limited=true;child.kill();},TIMEOUT_MS);
   child.stdout.on('data',b=>{
     if(size>=maxBytes){limited=true;child.kill();return;}
     const part=b.subarray(0,Math.max(0,maxBytes-size));size+=part.length;chunks.push(part);
     if(part.length<b.length){limited=true;child.kill();}
   });
   child.on('error',()=>finish(failure('GIT_START_FAILED')));
   child.on('close',code=>{
     const output=Buffer.concat(chunks).toString('utf8');
     finish({available:code===0&&!limited,partial:limited,code:limited?'LIMIT_REACHED':code===0?null:'GIT_COMMAND_FAILED',output});
   });
 }));
}
function statusFrom(raw){
 const counts={modified:0,added:0,deleted:0,renamed:0,untracked:0,conflicts:0,other:0};
 const rows=raw.split('\0');
 for(let i=0;i<rows.length;i++){
   const v=rows[i];if(!v||v.length<3)continue;const x=v[0],y=v[1];
   if(x==='?'&&y==='?')counts.untracked++;
   else if(x==='U'||y==='U'||(x==='A'&&y==='A')||(x==='D'&&y==='D'))counts.conflicts++;
   else if(x==='D'||y==='D')counts.deleted++;
   else if(x==='R'||y==='R'||x==='C'||y==='C'){counts.renamed++;i++;}
   else if(x==='A'||y==='A')counts.added++;
   else if(x==='M'||y==='M')counts.modified++;
   else counts.other++;
 }
 return counts;
}
function trackedSummary(raw){
 let files=0;const langs=new Map();
 for(const name of raw.split('\0')){
   if(!name)continue;files++;
   const lang=EXT_LANGUAGE[path.extname(name).toLowerCase()];
   if(lang)langs.set(lang,(langs.get(lang)??0)+1);
 }
 return {trackedFilesObserved:files,languages:[...langs].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))
   .slice(0,10).map(([name,count])=>({name,trackedFilesObserved:count}))};
}
async function hints(project){
 const names=[];
 for(const name of SAFE_DOCS){
   try {const st=await fs.lstat(path.join(project,name));
     if(!st.isSymbolicLink()&&(st.isFile()||st.isDirectory()))names.push(name);}
   catch(e){if(e?.code!=='ENOENT')return {available:false,code:'HINT_LOOKUP_FAILED'};}
 }
 let scripts=[];
 if(names.includes('package.json')){
   let file;
   try {
     file=await fs.open(path.join(project,'package.json'),'r');
     const st=await file.stat();
     if(st.isFile()&&st.size<=MAX_HINT_BYTES){
       const bytes=Buffer.alloc(st.size);
       const result=await file.read(bytes,0,st.size,0);
       if(result.bytesRead===st.size){
         const obj=JSON.parse(bytes.toString('utf8'));
         if(obj&&typeof obj.scripts==='object'&&!Array.isArray(obj.scripts))
           scripts=Object.keys(obj.scripts).filter(x=>x.length<=60&&!SECRET_SEGMENT.test(x)&&/^[a-zA-Z0-9_:.-]+$/.test(x)).slice(0,16);
       }
     }
   }catch{/* hints advisory */}finally{await file?.close();}
 }
 return {available:true,rootHints:names.sort(),npmScriptNames:scripts,commandsExecuted:false};
}
export async function inspectProject({requestedPath,allowedRoots,trustedGitExecutable}){
 const begin=Date.now();
 const {canonicalPath,canonicalRoots}=await authorizeProjectPath(requestedPath,allowedRoots);
 const preflight=await preflightGit(canonicalPath,canonicalRoots);
 const projectHints=await hints(canonicalPath);
 let git;
 if(!preflight.available){
   git={detected:false,code:preflight.code};
 } else {
   let policy;
   try { policy=await validateGitDataSources({...preflight,roots:canonicalRoots}); }
   catch(error){
     const code=String(error?.message??'');
     policy={authorized:false,code:code.startsWith('GIT_POLICY_')?code:'GIT_POLICY_CHECK_FAILED'};
   }
   if(!policy.authorized){
     git={detected:false,code:policy.code};
   } else {
   const executable=await resolveTrustedGit(trustedGitExecutable);
   if(inside(canonicalPath,executable))throw codeError('GIT_EXECUTABLE_INSIDE_PROJECT');
   // A second path check avoids continuing after an obvious preflight rename.
   const check=await preflightGit(canonicalPath,canonicalRoots);
   if(!check.available||check.root!==preflight.root||check.gitDir!==preflight.gitDir||check.commonDir!==preflight.commonDir)
     throw codeError('GIT_PREFLIGHT_CHANGED');
   // Re-verify local Git config/object-admission after path rechecks.
   try { await validateGitDataSources({...check,roots:canonicalRoots}); }
   catch(error){throw codeError(String(error?.message??'').startsWith('GIT_POLICY_')?'GIT_POLICY_CHANGED':'GIT_PREFLIGHT_CHANGED');}
   const [head,branch,status,log,tracked]=await Promise.all([
     runGit(executable,canonicalPath,preflight.root,['rev-parse','--verify','HEAD'],2048),
     runGit(executable,canonicalPath,preflight.root,['symbolic-ref','--quiet','--short','HEAD'],2048),
     runGit(executable,canonicalPath,preflight.root,['status','--porcelain=v1','-z','--untracked-files=normal','--ignore-submodules=all'],MAX_STATUS_OUTPUT),
     runGit(executable,canonicalPath,preflight.root,['log','-n','4','--date=iso-strict','--format=%h%x09%cI'],MAX_LOG_OUTPUT),
     runGit(executable,canonicalPath,preflight.root,['ls-files','-z','--cached','--deduplicate'],MAX_TRACKED_OUTPUT)
   ]);
   git={detected:true,topLevel:clean(preflight.root,512),
     head:head.available&&/^[0-9a-f]{40,64}$/i.test(head.output.trim())?head.output.trim():null,
     branch:branch.available?clean(branch.output.trim(),120):null,
     detached:head.available&&!branch.available,
     status:{available:status.available,complete:status.available,counts:statusFrom(status.output??''),
       ...(!status.available?{code:status.code}:{})},
     recentCommits:{available:log.available,complete:log.available,
       entries:log.output?log.output.trim().split('\n').filter(Boolean).slice(0,4).map(s=>{
         const [hash,at]=s.split('\t');return{hash:clean(hash,20),at:clean(at,42)};}):[]},
     inventory:{available:tracked.available,complete:tracked.available,
       ...(tracked.output?trackedSummary(tracked.output):{trackedFilesObserved:0,languages:[]}),
       ...(!tracked.available?{code:tracked.code}:{})}
   };
   }
 }
 const snapshot={schemaVersion:'desksom-project-inspection/v0.3',mode:'READ_ONLY_ADVISORY',
   observedAt:new Date().toISOString(),host:os.hostname(),path:canonicalPath,
   allowedRootMatched:true,projectHints,git,
   completeness:{gitStatus:!!git.status?.complete,trackedInventory:!!git.inventory?.complete,
     filesystemWalkPerformed:false,notProofOfNoOtherFiles:true},
   execution:{projectScriptsRun:false,dependencyInstallRun:false,gitWritesRequested:false,
     readOnlyIntent:true,atomicSnapshot:false},
   elapsedMs:Date.now()-begin};
 if(Buffer.byteLength(JSON.stringify(snapshot))>MAX_RETURN)throw codeError('INSPECTION_RESULT_TOO_LARGE');
 return snapshot;
}
