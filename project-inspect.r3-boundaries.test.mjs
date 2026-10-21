import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {inspectProject,resolveTrustedGit} from './project-inspect.mjs';
const execute=promisify(execFile);
const gitExe=await resolveTrustedGit();
async function git(cwd,args){
 return execute(gitExe,['-C',cwd,...args],{windowsHide:true,timeout:12000,
  env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:process.env.TEMP,
  GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'NUL',
  GIT_AUTHOR_NAME:'R3 Fixture',GIT_AUTHOR_EMAIL:'r3@example.invalid',
  GIT_COMMITTER_NAME:'R3 Fixture',GIT_COMMITTER_EMAIL:'r3@example.invalid'}});
}
async function seed(t){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'desksom-inspect-r3-'));
 t.after(async()=>fs.rm(base,{force:true,recursive:true,maxRetries:10,retryDelay:150}));
 const scope=path.join(base,'scope'),repo=path.join(scope,'repo'),outside=path.join(base,'outside');
 await fs.mkdir(repo,{recursive:true});await fs.mkdir(outside);
 await git(repo,['init','-q']);
 await fs.writeFile(path.join(repo,'sample.py'),'inside data\n');
 await git(repo,['add','.']);await git(repo,['commit','-qm','fixture']);
 await fs.writeFile(path.join(outside,'sample.py'),'external different data\n');
 const inspect=()=>inspectProject({requestedPath:repo,allowedRoots:[scope],trustedGitExecutable:gitExe});
 return {base,scope,repo,outside,inspect};
}
test('ordinary approved Git configuration remains usable',async t=>{
 const f=await seed(t);
 const s=await f.inspect();
 assert.equal(s.git.detected,true);
 assert.equal(s.git.status.complete,true);
 assert.equal(s.git.status.counts.modified,0);
 assert.equal(s.git.inventory.trackedFilesObserved,1);
});
test('deny core.worktree outside scope before invoking any Git program',async t=>{
 const f=await seed(t);await git(f.repo,['config','--local','core.worktree',f.outside]);
 const missingGit=path.join(f.outside,'not-a-real-git.exe');
 const s=await inspectProject({requestedPath:f.repo,allowedRoots:[f.scope],trustedGitExecutable:missingGit});
 assert.equal(s.git.detected,false);
 assert.equal(s.git.code,'GIT_POLICY_CONFIG_UNSUPPORTED');
 assert.equal(s.completeness.gitStatus,false);
});
test('deny include.path external config and includeIf before Git',async t=>{
 const f=await seed(t);
 const file=path.join(f.outside,'external.cfg');
 await fs.writeFile(file,'[core]\n worktree = '+f.outside.replaceAll('\\','/')+'\n');
 await git(f.repo,['config','--local','include.path',file]);
 const s=await f.inspect();
 assert.equal(s.git.detected,false);
 assert.equal(s.git.code,'GIT_POLICY_CONFIG_UNSUPPORTED');
 const g=await seed(t);
 await fs.appendFile(path.join(g.repo,'.git','config'),'\n[includeIf "gitdir:C:/elsewhere/"]\n path = C:/elsewhere/more.cfg\n');
 const q=await g.inspect();
 assert.equal(q.git.detected,false);
 assert.equal(q.git.code,'GIT_POLICY_CONFIG_UNSUPPORTED');
});
test('deny shared clone external alternates; no Git program launched',async t=>{
 const f=await seed(t);
 const clone=path.join(f.scope,'clone');
 await git(f.scope,['clone','--shared','-q',f.repo,clone]);
 const alt=path.join(clone,'.git','objects','info','alternates');
 assert.ok((await fs.readFile(alt,'utf8')).length>0);
 const s=await inspectProject({requestedPath:clone,allowedRoots:[path.dirname(clone)],trustedGitExecutable:path.join(f.outside,'missing.exe')});
 assert.equal(s.git.detected,false);
 assert.equal(s.git.code,'GIT_POLICY_OBJECT_ALTERNATES_DENIED');
});
test('deny alternates regardless of whether target is within root',async t=>{
 const f=await seed(t);
 const alternates=path.join(f.repo,'.git','objects','info','alternates');
 await fs.mkdir(path.dirname(alternates),{recursive:true});
 await fs.writeFile(alternates,'../objects\n');
 const s=await f.inspect();
 assert.equal(s.git.detected,false);
 assert.equal(s.git.code,'GIT_POLICY_OBJECT_ALTERNATES_DENIED');
});
test('deny local per-worktree config redirects',async t=>{
 const f=await seed(t);
 await fs.writeFile(path.join(f.repo,'.git','config.worktree'),'[core]\n worktree = '+f.outside.replaceAll('\\','/')+'\n');
 const s=await f.inspect();
 assert.equal(s.git.detected,false);
 assert.equal(s.git.code,'GIT_POLICY_CONFIG_UNSUPPORTED');
});
test('deny unsupported extensions and unsafe local Git sections',async t=>{
 const f=await seed(t);
 await fs.appendFile(path.join(f.repo,'.git','config'),'\n[extensions]\n worktreeConfig = true\n');
 const s=await f.inspect();
 assert.equal(s.git.detected,false);
 assert.equal(s.git.code,'GIT_POLICY_CONFIG_UNSUPPORTED');
});
test('reject symlinked object database rather than following it',async t=>{
 const f=await seed(t);
 const obj=path.join(f.repo,'.git','objects');
 const saved=path.join(f.repo,'.git','objects-original');
 await fs.rename(obj,saved);
 try{await fs.symlink(saved,obj,'junction');}
 catch(e){await fs.rename(saved,obj);if(['EPERM','EACCES','ENOTSUP'].includes(e?.code)){t.skip('symlink unavailable');return;}throw e;}
 const s=await f.inspect();
 assert.equal(s.git.detected,false);
 assert.equal(s.git.code,'GIT_POLICY_REPARSE_DENIED');
});
