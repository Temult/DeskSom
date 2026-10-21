import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {authorizeProjectPath,inspectProject} from './project-inspect.mjs';

const execFileAsync=promisify(execFile);
async function git(dir,args) {
  await execFileAsync('git',['-c','core.fsmonitor=false','-C',dir,...args],{
    windowsHide:true,env:{...process.env,GIT_OPTIONAL_LOCKS:'0'},timeout:12000
  });
}
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'desksom-project-inspect-'));
  t.after(async()=>{await fs.rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:150});});
  const repo=path.join(root,'repo'); await fs.mkdir(repo);
  await git(repo,['init','-q']);
  await fs.writeFile(path.join(repo,'README.md'),'Public fixture');
  await fs.writeFile(path.join(repo,'source.py'),'print(1)');
  await fs.writeFile(path.join(repo,'package.json'),JSON.stringify({scripts:{
    test:'node -e "throw new Error(\'SHOULD_NOT_RUN\')"',
    build:'do-not-run', 'secret-token':'must-hide'
  }}));
  await git(repo,['add','.']);
  await git(repo,['-c','user.name=Test Fixture','-c','user.email=test@example.invalid',
    'commit','-q','-m','Initial synthetic commit']);
  return {root,repo};
}
test('read-only snapshot reports Git identity, counts, documentation and script names without running scripts',async t=>{
  const {root,repo}=await fixture(t);
  const s=await inspectProject({requestedPath:repo,allowedRoots:[root]});
  assert.equal(s.schemaVersion,'desksom-project-inspection/v0.3');
  assert.equal(s.mode,'READ_ONLY_ADVISORY');
  assert.equal(s.git.detected,true);
  assert.equal(s.git.status.complete,true);
  assert.equal(s.git.inventory.complete,true);
  assert.equal(s.git.inventory.trackedFilesObserved,3);
  assert.equal(s.git.inventory.languages[0].name,'Python');
  assert.ok(s.projectHints.rootHints.includes('README.md'));
  assert.ok(s.projectHints.npmScriptNames.includes('test'));
  assert.ok(!s.projectHints.npmScriptNames.includes('secret-token'));
  assert.equal(s.projectHints.commandsExecuted,false);
  assert.equal(s.execution.projectScriptsRun,false);
  assert.ok(!JSON.stringify(s).includes('SHOULD_NOT_RUN'));
  assert.ok(!JSON.stringify(s).includes('must-hide'));
  assert.equal(s.git.status.counts.untracked,0);
});
test('dirty state counts are bounded; status filenames and secret file contents never exposed',async t=>{
  const {root,repo}=await fixture(t);
  await fs.writeFile(path.join(repo,'source.py'),'print(2)');
  await fs.writeFile(path.join(repo,'.env-secret-token'),'an-example-secret-value');
  await fs.writeFile(path.join(repo,'other.txt'),'fresh');
  const s=await inspectProject({requestedPath:repo,allowedRoots:[root]});
  assert.equal(s.git.status.counts.modified,1);
  assert.equal(s.git.status.counts.untracked,2);
  assert.ok(!JSON.stringify(s).includes('an-example-secret-value'));
  assert.ok(!JSON.stringify(s).includes('.env-secret-token'));
});
test('reject absolute-path escapes and prefix collision',async t=>{
  const {root,repo}=await fixture(t);
  await assert.rejects(authorizeProjectPath('..',[root]),/INVALID_ABSOLUTE_DIRECTORY/);
  await assert.rejects(authorizeProjectPath(repo,[path.join(root,'rep')]),/NO_AVAILABLE_APPROVED_ROOTS/);
  await assert.rejects(authorizeProjectPath(repo,[]),/NO_APPROVED_ROOTS/);
});
test('a nested allowed directory cannot inspect parent repository metadata',async t=>{
  const {repo}=await fixture(t);
  const sub=path.join(repo,'approved'); await fs.mkdir(sub);
  const s=await inspectProject({requestedPath:sub,allowedRoots:[sub]});
  assert.equal(s.git.detected,false);
  assert.equal(s.git.code,'GIT_ROOT_NOT_FOUND_WITHIN_APPROVED_ROOTS');
  assert.equal(s.completeness.gitStatus,false);
});
test('non-Git directory receives honest advisory result',async t=>{
  const {root}=await fixture(t);
  const sub=path.join(root,'other');await fs.mkdir(sub);
  const s=await inspectProject({requestedPath:sub,allowedRoots:[root]});
  assert.equal(s.git.detected,false);
  assert.equal(s.completeness.trackedInventory,false);
});
test('rejects junction or symbolic-link path pointing outside approved root when supported',async t=>{
  const {root,repo}=await fixture(t);
  const outside=await fs.mkdtemp(path.join(os.tmpdir(),'desksom-inspect-outside-'));
  t.after(async()=>fs.rm(outside,{recursive:true,force:true,maxRetries:8,retryDelay:150}));
  const link=path.join(repo,'linked');
  try { await fs.symlink(outside,link,'junction'); }
  catch(error) { if(['EPERM','EACCES','ENOTSUP'].includes(error?.code)){t.skip('Link creation restricted'); return;} throw error; }
  await assert.rejects(authorizeProjectPath(link,[repo]),/PROJECT_OUTSIDE_APPROVED_ROOTS/);
});

test('rejects a worktree whose Git metadata lives outside the approved root',async t=>{
  const {root,repo}=await fixture(t);
  const separate=path.join(root,'linked-worktree');
  await git(repo,['worktree','add','-q','-b','fixture-secondary',separate]);
  const result=await inspectProject({requestedPath:separate,allowedRoots:[separate]});
  assert.equal(result.git.detected,false);
  assert.equal(result.git.code,'GIT_METADATA_OUTSIDE_APPROVED_ROOTS');
});
