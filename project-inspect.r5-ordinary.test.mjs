import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {inspectProject,resolveTrustedGit} from './project-inspect.mjs';

const exec=promisify(execFile);
const gitExe=await resolveTrustedGit();
const env={SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:process.env.TEMP,
 GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'NUL',
 GIT_AUTHOR_NAME:'Test',GIT_AUTHOR_EMAIL:'test@example.invalid',
 GIT_COMMITTER_NAME:'Test',GIT_COMMITTER_EMAIL:'test@example.invalid'};
async function git(dir,args){
 await exec(gitExe,['-C',dir,...args],{env,timeout:12000,windowsHide:true});
}
async function fixture(t){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'desksom-r5-normal-'));
 t.after(()=>fs.rm(base,{recursive:true,force:true,maxRetries:8,retryDelay:150}));
 const repo=path.join(base,'repo');await fs.mkdir(repo);
 await git(repo,['init','-q']);
 await fs.writeFile(path.join(repo,'sample.py'),'print(1)\n');
 await git(repo,['add','.']);await git(repo,['commit','-qm','initial']);
 return {base,repo};
}
test('regular commondir metadata is inspected',async t=>{
 const {base,repo}=await fixture(t);
 await fs.writeFile(path.join(repo,'.git','commondir'),'.\n');
 const result=await inspectProject({requestedPath:repo,allowedRoots:[base],trustedGitExecutable:gitExe});
 assert.equal(result.git.detected,true);
 assert.equal(result.git.status.complete,true);
});
test('oversized commondir fails without claiming complete inspection',async t=>{
 const {base,repo}=await fixture(t);
 await fs.writeFile(path.join(repo,'.git','commondir'),'x'.repeat(4097));
 const result=await inspectProject({requestedPath:repo,allowedRoots:[base],trustedGitExecutable:gitExe});
 assert.equal(result.git.detected,false);
 assert.equal(result.git.code,'GIT_METADATA_INVALID');
 assert.equal(result.completeness.gitStatus,false);
});
test('linked worktree stays functional under approved common root',async t=>{
 const {base,repo}=await fixture(t);
 const linked=path.join(base,'linked');
 await git(repo,['worktree','add','-q','-b','linked-test',linked]);
 const result=await inspectProject({requestedPath:linked,allowedRoots:[base],trustedGitExecutable:gitExe});
 assert.equal(result.git.detected,true);
 assert.equal(result.git.status.complete,true);
});
