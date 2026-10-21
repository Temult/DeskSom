import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {inspectProject,resolveTrustedGit} from './project-inspect.mjs';
const run=promisify(execFile);
const trusted=await resolveTrustedGit();
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'desksom-inspect-repair-'));
 const repo=path.join(root,'repo');await fs.mkdir(repo);
 t.after(async()=>fs.rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:150}));
 await git(repo,['init','-q']);
 await fs.writeFile(path.join(repo,'sample.py'),'x=1\n');
 await git(repo,['add','sample.py']);
 await git(repo,['-c','user.name=RepairFixture','-c','user.email=fixture@example.invalid','commit','-qm','base']);
 return {root,repo};
}
async function git(repo,args,allowFailure=false){
 try{return await run(trusted,['-C',repo,...args],{windowsHide:true,timeout:12000,env:{
  SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:process.env.TEMP,
  GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'NUL',GIT_TERMINAL_PROMPT:'0',
  GIT_AUTHOR_NAME:'Fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',
  GIT_COMMITTER_NAME:'Fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid'
 }})}
 catch(e){if(!allowFailure)throw e;return e;}
}
test('Windows working-tree git.exe decoy is not launched by inspector',async t=>{
 const {root,repo}=await fixture(t);
 const decoy=path.join(repo,'git.exe');
 await fs.copyFile(path.join(process.env.SystemRoot||'C:\\Windows','System32','whoami.exe'),decoy);
 const snapshot=await inspectProject({requestedPath:repo,allowedRoots:[root],trustedGitExecutable:trusted});
 assert.equal(snapshot.git.detected,true);
 assert.equal(snapshot.git.inventory.trackedFilesObserved,1);
 assert.equal(snapshot.git.status.counts.untracked,1);
});
test('poisoned ambient GIT_TRACE and GIT_TRACE2_EVENT do not create files',async t=>{
 const {root,repo}=await fixture(t);
 const trace=path.join(root,'ambient-git-trace.log'),trace2=path.join(root,'ambient-trace2.log');
 const old1=process.env.GIT_TRACE,old2=process.env.GIT_TRACE2_EVENT,old3=process.env.GIT_INDEX_FILE;
 process.env.GIT_TRACE=trace;process.env.GIT_TRACE2_EVENT=trace2;
 process.env.GIT_INDEX_FILE=path.join(root,'ghost.index');
 try {
  const snapshot=await inspectProject({requestedPath:repo,allowedRoots:[root],trustedGitExecutable:trusted});
  assert.equal(snapshot.git.detected,true);
  assert.equal(snapshot.git.inventory.trackedFilesObserved,1);
  assert.equal(snapshot.git.status.counts.untracked,0);
  await assert.rejects(fs.stat(trace),{code:'ENOENT'});
  await assert.rejects(fs.stat(trace2),{code:'ENOENT'});
  await assert.rejects(fs.stat(path.join(root,'ghost.index')),{code:'ENOENT'});
 }finally{
  for(const [k,v] of [['GIT_TRACE',old1],['GIT_TRACE2_EVENT',old2],['GIT_INDEX_FILE',old3]]){
   if(v===undefined)delete process.env[k];else process.env[k]=v;
  }
 }
});
test('external metadata is refused by filesystem preflight before Git launch',async t=>{
 const {root,repo}=await fixture(t);
 const narrow=path.join(repo,'narrow');await fs.mkdir(narrow);
 const trace=path.join(root,'forbidden-git-trace.log'),old=process.env.GIT_TRACE;
 process.env.GIT_TRACE=trace;
 try {
   const s=await inspectProject({requestedPath:narrow,allowedRoots:[narrow],trustedGitExecutable:trusted});
   assert.equal(s.git.detected,false);
   assert.equal(s.git.code,'GIT_ROOT_NOT_FOUND_WITHIN_APPROVED_ROOTS');
   await assert.rejects(fs.stat(trace),{code:'ENOENT'});
 }finally{if(old===undefined)delete process.env.GIT_TRACE;else process.env.GIT_TRACE=old;}
});
test('unmerged Git index stages count one unique tracked path',async t=>{
 const {root,repo}=await fixture(t);
 const base=(await git(repo,['branch','--show-current'])).stdout.trim();
 await git(repo,['checkout','-qb','other']);
 await fs.writeFile(path.join(repo,'sample.py'),'x=2\n');await git(repo,['commit','-qam','side']);
 await git(repo,['checkout','-q',base]);
 await fs.writeFile(path.join(repo,'sample.py'),'x=3\n');await git(repo,['commit','-qam','main']);
 const merge=await git(repo,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid',
  'merge','--no-edit','other'],true);
 assert.notEqual(merge.code,undefined);
 const s=await inspectProject({requestedPath:repo,allowedRoots:[root],trustedGitExecutable:trusted});
 assert.equal(s.git.status.counts.conflicts,1);
 assert.equal(s.git.inventory.complete,true);
 assert.equal(s.git.inventory.trackedFilesObserved,1);
 assert.equal(s.git.inventory.languages.find(v=>v.name==='Python').trackedFilesObserved,1);
});
test('non absolute trusted executable cannot be used',async()=>{
 await assert.rejects(resolveTrustedGit('git'),/GIT_EXECUTABLE_NOT_ABSOLUTE/);
});
