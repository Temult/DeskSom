import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {canonical,hashObject,normalizeWin,insideWin,overlapWin,safeRelative,instanceName,DeskSomError,loadRelease,hashFile,createJson,envelope,redactedError,assertNoLinks} from '../lib/common.mjs';
import {makePlan,checkPlanShape,taskDefinition,taskMatches,identityMatches,ensureTask,install} from '../lib/install-core.mjs';
import {parseArgs,run} from '../cli.mjs';
const env={platform:'win32',architecture:'x64',host:'TEST-PC',sid:'S-1-5-21-1-2-3-1001',localAppData:'C:\\Users\\Test\\AppData\\Local',windowsDir:'C:\\Windows',programFiles:'C:\\Program Files',elevated:false,node:'C:\\Node\\node.exe',pwsh:'C:\\PowerShell\\pwsh.exe',nodeMajor:22,pwshSupported:true};
const release={fingerprint:'a'.repeat(64),manifest:{version:'0.2.0-rc.1'}};
const spec={instance:'test',installRoot:'C:\\Install\\DeskSom',stateRoot:'C:\\State\\DeskSom',allowedDirectories:['C:\\Work'],port:19671};
const source='C:\\Downloads\\DeskSom';
const errorCode=code=>e=>e instanceof DeskSomError&&e.code===code;
function plan(changes={},environment={}){return makePlan(source,{...spec,...changes},{...env,...environment},release);}

test('canonical plan and checksum are deterministic, insensitive to object key order',()=>{
 assert.equal(canonical({b:2,a:[3,{z:4,x:5}]}),canonical({a:[3,{x:5,z:4}],b:2}));
 const a=plan(),b=plan();assert.deepEqual(a,b);checkPlanShape(a);assert.equal(a.planSha256.length,64);
 assert.equal(a.permissions.shell,'FULL_WINDOWS_USER_PERMISSIONS_NOT_A_SANDBOX');
});
test('whole drives and system folders are rejected',()=>{
 for(const allowedDirectories of [['C:\\'],['C:\\Windows\\Temp'],['C:\\Program Files\\Example']])assert.throws(()=>plan({allowedDirectories}),errorCode('SENSITIVE_ROOT'));
});
test('instance validation, port boundaries and duplicate root normalization',()=>{
 for(const name of ['','A','x y','../x','a'.repeat(25)])assert.throws(()=>instanceName(name));
 assert.equal(instanceName('desk-2'),'desk-2');
 for(const port of [0,1023,65536,1.5,'12345'])assert.throws(()=>plan({port}),errorCode('INVALID_PORT'));
 assert.deepEqual(plan({allowedDirectories:['C:\\Work','c:/work/']}).allowedDirectories,['c:\\work']);
});
test('platform, elevation and missing prerequisites fail closed',()=>{
 assert.throws(()=>plan({}, {platform:'linux'}),errorCode('UNSUPPORTED_PLATFORM'));
 assert.throws(()=>plan({}, {architecture:'arm64'}),errorCode('UNSUPPORTED_PLATFORM'));
 assert.throws(()=>plan({}, {elevated:true}),errorCode('ELEVATED_SESSION'));
 assert.throws(()=>plan({}, {nodeMajor:20}),errorCode('PREREQUISITES_MISSING'));
 assert.throws(()=>plan({}, {pwshSupported:false}),errorCode('PREREQUISITES_MISSING'));
});
test('directory overlap and file-tool access to service/credentials are rejected',()=>{
 assert.throws(()=>plan({installRoot:'C:\\Downloads\\DeskSom\\runtime'}),errorCode('OVERLAPPING_PATHS'));
 assert.throws(()=>plan({stateRoot:'C:\\Install\\DeskSom\\state'}),errorCode('OVERLAPPING_PATHS'));
 assert.throws(()=>plan({allowedDirectories:['C:\\State']}),errorCode('SELF_ACCESS_ROOT'));
 assert.throws(()=>plan({allowedDirectories:['C:\\Install\\DeskSom\\runtime']}),errorCode('SELF_ACCESS_ROOT'));
 assert.throws(()=>plan({allowedDirectories:[]}),errorCode('ROOTS_REQUIRED'));
});
test('Windows paths with spaces, Unicode and apostrophe survive without shell interpolation',()=>{
 const p=plan({allowedDirectories:["D:\\Owner's Project\\éclair"],installRoot:'C:\\Install Here\\DeskSom'});
 assert.deepEqual(p.allowedDirectories,["d:\\owner's project\\éclair"]);
 const state={installationId:'00000000-0000-4000-8000-000000000001',environment:{wscript:'C:\\Windows\\System32\\wscript.exe'}};
 const def=taskDefinition(p,state,'local');assert.match(def.arguments,/^\/\/B \/\/Nologo "/);assert.ok(def.arguments.endsWith('"'));
});
test('unsafe Windows namespaces, ADS, device names and trailing dots/spaces are rejected',()=>{
 for(const p of ['relative','\\\\server\\share','\\\\?\\C:\\Work','C:\\Work:secret','C:\\con','C:\\Work.','C:\\Work \\X','C:\\x\nfoo'])assert.throws(()=>normalizeWin(p));
 assert.throws(()=>normalizeWin('C:/One/../Work/'));assert.equal(normalizeWin('C:/Work/'),'C:\\Work');
 assert.equal(insideWin('C:\\work\\x','c:\\work'),true);assert.equal(insideWin('C:\\work-other','C:\\work'),false);
 assert.equal(overlapWin('C:\\work','C:\\work\\x'),true);
});
test('plan mutation and unrecognized fields are rejected even when digest is recalculated',()=>{
 const original=plan();assert.throws(()=>checkPlanShape({...original,port:22222}),errorCode('PLAN_CHANGED'));
 const {planSha256,...core}=original;const malicious={...core,unexpected:'field'};
 assert.throws(()=>checkPlanShape({...malicious,planSha256:hashObject(malicious)}),errorCode('INVALID_INPUT'));
 assert.throws(()=>plan({extra:'not permitted'}),errorCode('INVALID_INPUT'));
});
test('consent is checked before filesystem, network or Windows effects',async()=>{
 let touched=false;const p={...plan()};const platform=new Proxy({}, {get(){touched=true;throw Error('must not reach platform')}});
 await assert.rejects(install(source,p,{acceptShellAccess:false,approvePlanSha256:p.planSha256},platform),errorCode('CONSENT_REQUIRED'));
 await assert.rejects(install(source,p,{acceptShellAccess:true,approvePlanSha256:'b'.repeat(64)},platform),errorCode('CONSENT_REQUIRED'));
 assert.equal(touched,false);
});
test('task identity includes caller SID, full launcher path, level and installation marker',()=>{
 const p=plan(),s={installationId:'00000000-0000-4000-8000-000000000001',environment:{wscript:'C:\\Windows\\System32\\wscript.exe'}};
 const d=taskDefinition(p,s,'local');assert.equal(taskMatches({...d,state:'Ready'},d),true);
 for(const key of ['sid','execute','arguments','workingDirectory','runLevel','logonType','installationId'])assert.equal(taskMatches({...d,[key]:'foreign'},d),false);
});
test('missing-task creation is read back; changed or uncertain tasks are not overwritten',async()=>{
 const p=plan(),s={plan:p,installationId:'00000000-0000-4000-8000-000000000001',environment:{wscript:'C:\\Windows\\System32\\wscript.exe'}};
 let current=null,creates=0;const platform={async taskGet(){return current},async taskCreate(d){creates++;current={...d,state:'Ready',enabled:true}}};
 await ensureTask(s,'local',platform);await ensureTask(s,'local',platform);assert.equal(creates,1);
 current.arguments='foreign';await assert.rejects(ensureTask(s,'local',platform),errorCode('TASK_DRIFT'));assert.equal(creates,1);
 const uncertain={async taskGet(){return null},async taskCreate(){}};
 await assert.rejects(ensureTask(s,'local',uncertain),errorCode('TASK_WRITE_UNCERTAIN'));
});
test('runtime readiness requires exact installation identity, not just HTTP 200',()=>{
 const p=plan(),state={plan:p,installationId:'i'};
 const probe={ready:true,host:p.binding.host,instance:p.instance,installationId:'i',sourceFingerprint:p.sourceFingerprint,version:p.version};
 assert.ok(identityMatches(probe,state));for(const key of Object.keys(probe))assert.equal(identityMatches({...probe,[key]:key==='ready'?false:'wrong'},state),false);
});
test('CLI rejects positional commands, unknown/duplicate switches and any API key argument',()=>{
 for(const args of [['install','--api-key','secret'],['plan','--json','--json'],['plan','spec.json'],['status','--state'],['unknown'],['repair','--force']])assert.throws(()=>parseArgs(args));
 assert.deepEqual(parseArgs(['verify','--state','C:\\S','--exercise','--json']),{command:'verify',args:{state:'C:\\S',exercise:true,json:true}});
});
test('help and local result envelopes never claim a completed ChatGPT connection',async()=>{
 const r=await run(['help'],source,{});assert.equal(r.setupComplete,false);assert.equal(envelope('verify',{status:'LOCAL_READY'}).setupComplete,false);
});
test('diagnostic error redaction never includes arbitrary underlying exception contents',()=>{
 const r=redactedError(new Error('sk-secret-private-key C:\\Users\\Someone\\file.txt'));
 assert.ok(!JSON.stringify(r).includes('Someone'));assert.ok(!JSON.stringify(r).includes('sk-secret'));
});
test('manifest paths reject traversal, absolute paths and case-alias hazards',()=>{
 for(const p of ['../file','/file','scripts/../key','C:/x','scripts\\x','scripts//x'])assert.throws(()=>safeRelative(p));
 assert.equal(safeRelative('scripts/Verify.ps1'),'scripts/Verify.ps1');
});
test('create-only JSON output refuses to overwrite an existing file',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'desksom-output-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'out.json');await createJson(file,{original:true});await assert.rejects(createJson(file,{replaced:true}));
 assert.equal(JSON.parse(await fs.readFile(file,'utf8')).original,true);
});
test('release digest checks reject changed source and duplicate manifest entries',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'desksom-manifest-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 await fs.writeFile(path.join(dir,'a.txt'),'reviewed');const entry={path:'a.txt',sha256:await hashFile(path.join(dir,'a.txt')),bytes:8};
 await fs.writeFile(path.join(dir,'release-manifest.json'),JSON.stringify({schemaVersion:'desksom.release/v1',version:'0.2.0-rc.1',files:[entry]}));
 await fs.writeFile(path.join(dir,'a.txt'),'modified');await assert.rejects(loadRelease(dir),errorCode('SOURCE_DRIFT'));
 await fs.writeFile(path.join(dir,'a.txt'),'reviewed');await fs.writeFile(path.join(dir,'release-manifest.json'),JSON.stringify({schemaVersion:'desksom.release/v1',version:'v',files:[entry,entry]}));
 await assert.rejects(loadRelease(dir),errorCode('INVALID_MANIFEST'));
});
