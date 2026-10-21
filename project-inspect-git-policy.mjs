// Filesystem-only, deliberately conservative Git data-admission policy.
// No invocation of git is permitted during this preflight.
// An unfamiliar/unsafe Git configuration returns a typed advisory refusal.
import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_CONFIG_BYTES=65536;
const SAFE_KEYS=Object.freeze({
 core:new Set(['repositoryformatversion','filemode','bare','logallrefupdates','ignorecase',
   'precomposeunicode','symlinks','autocrlf','eol','quotepath','whitespace','abbrev']),
 remote:new Set(['url','fetch','pushurl','push','mirror','tagopt','prune','prunetags']),
 branch:new Set(['remote','merge','rebase','pushremote','description']),
 user:new Set(['name','email']),
 init:new Set(['defaultbranch']),
 pull:new Set(['ff','rebase']),
 push:new Set(['default','autosetupremote']),
 gc:new Set(['auto','autodetach','writecommitgraph']),
 maintenance:new Set(['auto','strategy']),
 status:new Set(['short','showuntrackedfiles','relativepaths']),
 diff:new Set(['algorithm','renames','renamelimit','context','ignoresubmodules']),
 merge:new Set(['conflictstyle','ff','renamelimit'])
});
const SUBSECTION_REQUIRED=new Set(['remote','branch']);
function fail(code){throw new Error(code);}
function inside(root,target){
 const r=process.platform==='win32'?root.toLowerCase():root;
 const t=process.platform==='win32'?target.toLowerCase():target;
 const rel=path.relative(r,t);
 return rel===''||(rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel));
}
function scoped(p,roots){return roots.some(root=>inside(root,p));}

async function checkedPath(file,roots,expectDirectory){
 let st;
 try{st=await fs.lstat(file);}catch(error){
   if(error?.code==='ENOENT')return null;
   fail('GIT_POLICY_PATH_UNAVAILABLE');
 }
 // Do not follow reparse points in policy files. This keeps the intended
 // local inspection boundary stricter than Git's own path resolution.
 if(st.isSymbolicLink())fail('GIT_POLICY_REPARSE_DENIED');
 let actual;
 try{actual=await fs.realpath(file);}catch{fail('GIT_POLICY_PATH_UNAVAILABLE');}
 if(!scoped(actual,roots))fail('GIT_POLICY_OUTSIDE_APPROVED_ROOTS');
 if(expectDirectory&&!st.isDirectory())fail('GIT_POLICY_PATH_INVALID');
 if(!expectDirectory&&!st.isFile())fail('GIT_POLICY_PATH_INVALID');
 return {actual,st};
}
async function readConfig(file,roots){
 const item=await checkedPath(file,roots,false);
 if(!item)return null;
 if(item.st.size>MAX_CONFIG_BYTES)fail('GIT_POLICY_CONFIG_OVERSIZE');
 const handle=await fs.open(item.actual,'r');
 try{
   const st=await handle.stat();
   if(!st.isFile()||st.size>MAX_CONFIG_BYTES)fail('GIT_POLICY_CONFIG_OVERSIZE');
   const b=Buffer.alloc(st.size);
   const {bytesRead}=await handle.read(b,0,st.size,0);
   if(bytesRead!==st.size)fail('GIT_POLICY_CONFIG_CHANGED');
   return b.toString('utf8');
 }finally{await handle.close();}
}
function parseSafeConfig(text){
 if(text.includes('\0')||text.includes('\uFFFD'))fail('GIT_POLICY_CONFIG_UNSUPPORTED');
 let section='';
 for(const line of text.split(/\r?\n/)){
   const trimmed=line.trim();
   if(!trimmed||trimmed.startsWith('#')||trimmed.startsWith(';'))continue;
   // Reject multiline continuations and syntax we cannot classify.
   // Normal Windows remote URLs remain supported; no remote operations run.
   if(/\\\s*$/.test(line))fail('GIT_POLICY_CONFIG_UNSUPPORTED');
   if(trimmed.startsWith('[')){
     const m=/^\[([a-zA-Z][a-zA-Z0-9]*)(?:[ \t]+"([^"\r\n]*)")?\][ \t]*(?:[#;].*)?$/.exec(trimmed);
     if(!m)fail('GIT_POLICY_CONFIG_UNSUPPORTED');
     section=m[1].toLowerCase();
     if(!Object.hasOwn(SAFE_KEYS,section))fail('GIT_POLICY_CONFIG_UNSUPPORTED');
     if(SUBSECTION_REQUIRED.has(section)!==Boolean(m[2]))fail('GIT_POLICY_CONFIG_UNSUPPORTED');
     continue;
   }
   const m=/^([a-zA-Z][a-zA-Z0-9-]*)[ \t]*(?:=[ \t]*(.*))?$/.exec(trimmed);
   if(!section||!m)fail('GIT_POLICY_CONFIG_UNSUPPORTED');
   const key=m[1].toLowerCase(),value=m[2]??'';
   if(!SAFE_KEYS[section]?.has(key))fail('GIT_POLICY_CONFIG_UNSUPPORTED');
   if(section==='core'&&key==='bare'&&!/^(?:false|no|off|0)$/i.test(value.trim()))
     fail('GIT_POLICY_BARE_REPOSITORY');
   // A config value that can spill a multiline directive is not allowed.
   if(value.includes('\r')||value.includes('\0'))fail('GIT_POLICY_CONFIG_UNSUPPORTED');
 }
}
async function checkedDirectory(file,roots){
 const result=await checkedPath(file,roots,true);
 return result?.actual??null;
}
// Git may consult paths beyond its obvious config, refs and object roots.
// Recursively inspect each admitted administrative tree before any Git process,
// without following directory junctions, file symlinks or reparse redirects.
// Larger repositories fail closed at a bounded cost rather than claiming a
// complete scope check from a partial walk.
export async function assertMetadataTreeContained({dirs,roots,maxEntries=30000,maxMs=5000}){
 if(!Number.isInteger(maxEntries)||maxEntries<1||!Number.isFinite(maxMs)||maxMs<1)
   fail('GIT_POLICY_SCAN_LIMIT_INVALID');
 const start=Date.now(),visited=new Set();
 let scanned=0;
 const pending=[...new Set(dirs)];
 while(pending.length){
   if(Date.now()-start>maxMs)fail('GIT_POLICY_SCAN_LIMIT');
   const dir=pending.pop();
   const rootInfo=await fs.lstat(dir).catch(()=>fail('GIT_POLICY_METADATA_UNAVAILABLE'));
   if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink())
     fail('GIT_POLICY_REPARSE_DENIED');
   const canonical=await fs.realpath(dir).catch(()=>fail('GIT_POLICY_METADATA_UNAVAILABLE'));
   if(!scoped(canonical,roots))fail('GIT_POLICY_METADATA_ESCAPE');
   const key=process.platform==='win32'?canonical.toLowerCase():canonical;
   if(visited.has(key))continue;
   visited.add(key);
   let directory;
   try{directory=await fs.opendir(dir);}catch{fail('GIT_POLICY_METADATA_UNAVAILABLE');}
   try {
     for await(const item of directory){
       if(Date.now()-start>maxMs||++scanned>maxEntries)fail('GIT_POLICY_SCAN_LIMIT');
       const child=path.join(dir,item.name);
       let st;
       try{st=await fs.lstat(child);}catch{fail('GIT_POLICY_METADATA_UNAVAILABLE');}
       if(st.isSymbolicLink())fail('GIT_POLICY_REPARSE_DENIED');
       if(st.isDirectory()){
         const actual=await fs.realpath(child).catch(()=>fail('GIT_POLICY_METADATA_UNAVAILABLE'));
         if(!scoped(actual,roots))fail('GIT_POLICY_METADATA_ESCAPE');
         // Reject unrecognized reparse redirects even when still inside roots.
         const expected=path.resolve(child);
         const lhs=process.platform==='win32'?actual.toLowerCase():actual;
         const rhs=process.platform==='win32'?expected.toLowerCase():expected;
         if(lhs!==rhs)fail('GIT_POLICY_REPARSE_DENIED');
         pending.push(child);
       } else if(!st.isFile())fail('GIT_POLICY_METADATA_UNSUPPORTED');
     }
   }catch(error){
     throw error?.message?.startsWith('GIT_POLICY_')?error: new Error('GIT_POLICY_METADATA_UNAVAILABLE');
   }finally{await directory.close().catch(()=>{});}
 }
 return {complete:true,entries:scanned,directories:visited.size};
}
export async function validateGitDataSources({root,gitDir,commonDir,roots}){
 if(!roots.some(r=>inside(r,root)))fail('GIT_POLICY_ROOT_DENIED');
 const targetDirs=[...new Set([gitDir,commonDir])];
 for(const dir of targetDirs){
   const real=await fs.realpath(dir);
   if(!scoped(real,roots))fail('GIT_POLICY_OUTSIDE_APPROVED_ROOTS');
 }
 // The per-worktree and common config both matter. Unknown config sections,
 // includeIf, include.path, core.worktree, extensions, filters and external
 // command helpers all fail closed instead of trying to model Git internals.
 for(const config of new Set([
   path.join(commonDir,'config'),path.join(gitDir,'config'),
   path.join(gitDir,'config.worktree'),path.join(commonDir,'config.worktree')
 ])){
   const text=await readConfig(config,roots);
   if(text!==null)parseSafeConfig(text);
 }
 // A normal Git repo has a local object directory. Linked worktrees may
 // obtain it from a separate approved commonDir.
 const objects=path.join(commonDir,'objects');
 if(!await checkedDirectory(objects,roots))fail('GIT_POLICY_OBJECTS_UNAVAILABLE');
 // Object alternates support recursion/chains; deny even in-scope alternates
 // to avoid an incomplete graph of directories or hidden reference cycles.
 const locations=new Set([path.join(commonDir,'objects'),path.join(gitDir,'objects')]);
 for(const location of locations){
   const obj=await checkedDirectory(location,roots);
   if(!obj)continue;
   const info=await checkedDirectory(path.join(obj,'info'),roots);
   if(info){
     const alternate=path.join(info,'alternates');
     const httpAlternate=path.join(info,'http-alternates');
     for(const file of [alternate,httpAlternate]){
       const st=await fs.lstat(file).catch(e=>{
         if(e?.code==='ENOENT')return null;
         fail('GIT_POLICY_PATH_UNAVAILABLE');
       });
       if(st)fail('GIT_POLICY_OBJECT_ALTERNATES_DENIED');
     }
   }
   // Packs may be read by Git; refuse out-of-scope reparse-point pack roots.
   await checkedDirectory(path.join(obj,'pack'),roots);
 }
 const scan=await assertMetadataTreeContained({dirs:targetDirs,roots});
 return {authorized:true,policy:'RESTRICTED_LOCAL_GIT_NO_ALTERNATES',metadataScan:scan};
}
