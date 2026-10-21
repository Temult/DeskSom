import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {inspectProject,resolveTrustedGit} from './project-inspect.mjs';
import {assertMetadataTreeContained} from './project-inspect-git-policy.mjs';
const run=promisify(execFile);
const exe=await resolveTrustedGit();
const env={SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:process.env.TEMP,
 GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'NUL',GIT_CONFIG_SYSTEM:'NUL',
 GIT_AUTHOR_NAME:'Review Fixture',GIT_AUTHOR_EMAIL:'review@example.invalid',
 GIT_COMMITTER_NAME:'Review Fixture',GIT_COMMITTER_EMAIL:'review@example.invalid'};
async function git(cwd,args){return (await run(exe,['-C',cwd,...args],{env,windowsHide:true,timeout:12000})).stdout.trim();}
async function fixture(t){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'desksom-r4-'));
 t.after(async()=>fs.rm(base,{recursive:true,force:true,maxRetries:8,retryDelay:150}));
 const scope=path.join(base,'scope'),repo=path.join(scope,'repo'),outside=path.join(base,'outside');
 await fs.mkdir(repo,{recursive:true}); await fs.mkdir(outside);
 await git(repo,['init','-q']);
 await fs.writeFile(path.join(repo,'sample.py'),'x=1\n');
 await git(repo,['add','sample.py']);await git(repo,['commit','-qm','test']);
 const head=await git(repo,['rev-parse','HEAD']);
 const inspect=(missing=false)=>inspectProject({requestedPath:repo,allowedRoots:[scope],
  trustedGitExecutable:missing?path.join(outside,'nonexistent-git.exe'):exe});
 return {base,scope,repo,outside,head,inspect};
}
async function relocatedJunction(t,fn){
 const f=await fixture(t);
 const baseline=await f.inspect();
 assert.equal(baseline.git.detected,true);
 const from=fn(f),to=path.join(f.outside,path.basename(from)+'-outside');
 await fs.rename(from,to);
 try{await fs.symlink(to,from,'junction');}
 catch(e){if(['EPERM','EACCES','ENOTSUP'].includes(e?.code)){t.skip('Windows junction creation denied');return;}throw e;}
 const denied=await f.inspect(true);
 assert.equal(denied.git.detected,false);
 assert.equal(denied.git.code,'GIT_POLICY_REPARSE_DENIED');
 const normal=await f.inspect();
 assert.equal(normal.git.detected,false);
 assert.equal(normal.git.code,'GIT_POLICY_REPARSE_DENIED');
}
test('R3-N01 ref-tree junction outside root denied before executable resolution',async t=>{
 await relocatedJunction(t,f=>path.join(f.repo,'.git','refs'));
});
test('R3-N02 loose object shard junction denied before executable resolution',async t=>{
 await relocatedJunction(t,f=>path.join(f.repo,'.git','objects',f.head.slice(0,2)));
});
test('nested in-scope junction also denied, rather than following redirect',async t=>{
 const f=await fixture(t);
 const original=path.join(f.repo,'.git','logs'),dest=path.join(f.scope,'logs-internal');
 await fs.rename(original,dest);await fs.symlink(dest,original,'junction');
 const r=await f.inspect(true);
 assert.equal(r.git.detected,false);
 assert.equal(r.git.code,'GIT_POLICY_REPARSE_DENIED');
});
test('bounded traversal does not claim completion on partial metadata walk',async t=>{
 const f=await fixture(t);
 await assert.rejects(assertMetadataTreeContained({dirs:[await fs.realpath(path.join(f.repo,'.git'))],roots:[await fs.realpath(f.scope)],maxEntries:1,maxMs:5000}),/GIT_POLICY_SCAN_LIMIT/);
});
test('normal Git reference and loose-object trees remain inspectable',async t=>{
 const f=await fixture(t);
 const r=await f.inspect();
 assert.equal(r.git.detected,true);
 assert.equal(r.git.head,f.head);
 assert.equal(r.git.status.complete,true);
 assert.equal(r.git.inventory.trackedFilesObserved,1);
});
test('reparse of metadata file is denied when Windows file symlink allowed',async t=>{
 const f=await fixture(t);
 const from=path.join(f.repo,'.git','index'),to=path.join(f.outside,'index');
 await fs.rename(from,to);
 try{await fs.symlink(to,from,'file');}
 catch(e){if(['EPERM','EACCES','ENOTSUP'].includes(e?.code)){t.skip('Windows file symlinks denied');return;}throw e;}
 const r=await f.inspect(true);
 assert.equal(r.git.detected,false);
 assert.equal(r.git.code,'GIT_POLICY_REPARSE_DENIED');
});
