import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import fsSync from 'node:fs';import path from 'node:path';import os from 'node:os';
import {boundedArguments} from './security.mjs';
import {resolveProspectivePath,validateFileOperation} from './file-operation-guard.mjs';
async function fixture(){const base=fsSync.realpathSync.native(await fs.mkdtemp(path.join(os.tmpdir(),'desksom-upstream-guard-'))),allowed=path.join(base,'allowed');await fs.mkdir(allowed);return {base,allowed,cfg:{workDir:allowed,allowedDirectories:[allowed]},clean:()=>fs.rm(base,{recursive:true,force:true,maxRetries:4,retryDelay:50})}}
test('invalid destructive PIDs reject before dispatch without sending any signals',()=>{
 for(const name of ['kill_process','force_terminate'])for(const pid of [0,-1,-42,1.5,NaN,Infinity,'123',null,undefined,2147483648])assert.throws(()=>boundedArguments(name,{pid}),/INVALID_PID/);
 assert.deepEqual(boundedArguments('kill_process',{pid:123}),{pid:123});
});
test('ordinary nested new files and same-root rename preserve caller arguments',async()=>{
 const f=await fixture();try{
  const args={path:path.join(f.allowed,'new','file.txt'),content:'ordinary'};
  await validateFileOperation('write_file',args,f.cfg);assert.equal(args.path,path.join(f.allowed,'new','file.txt'));
  await validateFileOperation('move_file',{source:path.join(f.allowed,'source'),destination:path.join(f.allowed,'target')},f.cfg);
  await assert.rejects(()=>validateFileOperation('write_file',{path:path.join(f.base,'outside','file')},f.cfg),/OUTSIDE_APPROVED/);
  await validateFileOperation('start_process',{command:'not executed by this test'},f.cfg);
 }finally{await f.clean()}
});
test('dangling junction outside allowed root is rejected; inside-root missing target remains valid',async()=>{
 const f=await fixture();try{
  const escape=path.join(f.allowed,'escape'),outside=path.join(f.base,'outside-missing');
  await fs.symlink(outside,escape,process.platform==='win32'?'junction':'dir');
  await assert.rejects(()=>validateFileOperation('create_directory',{path:escape},f.cfg),/OUTSIDE_APPROVED/);
  await assert.rejects(()=>validateFileOperation('write_file',{path:path.join(escape,'new.txt')},f.cfg),/OUTSIDE_APPROVED/);
  assert.equal(fsSync.existsSync(outside),false);
  const inner=path.join(f.allowed,'inner-link'),target=path.join(f.allowed,'future');
  await fs.symlink(target,inner,process.platform==='win32'?'junction':'dir');
  await validateFileOperation('write_file',{path:path.join(inner,'new.txt')},f.cfg);
 }finally{await f.clean()}
});
test('PDF outputPath and both move operands are checked independently',async()=>{
 const f=await fixture();try{
  for(const [name,args]of [['write_pdf',{path:path.join(f.allowed,'in.pdf'),outputPath:path.join(f.base,'out.pdf')}],
    ['move_file',{source:path.join(f.base,'outside'),destination:path.join(f.allowed,'in')}],
    ['edit_block',{file_path:path.join(f.base,'outside')}],['create_directory',{path:0}]])await assert.rejects(()=>validateFileOperation(name,args,f.cfg));
 }finally{await f.clean()}
});
test('permission errors are not mistaken for a missing ancestor',async()=>{
 const denied=Object.assign(new Error('denied'),{code:'EACCES'});
 await assert.rejects(()=>resolveProspectivePath(path.resolve('fixture'),{io:{realpath:async()=>{throw denied}}}),e=>e===denied);
});
