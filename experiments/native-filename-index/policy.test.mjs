import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

const qa='C:\\Projects\\Somner\\DeskSom\\ops\\native-index-poc-20261018-policy';
const fixture=path.join(qa,'fixture');
const config=path.join(qa,'config.json');
const denied=path.join(qa,'denied.json');
const db=path.join(qa,'files.sqlite');
const engine=path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1').replace(/\//g,'\\')),'index.mjs');
if(fs.existsSync(qa)) throw Error('Policy fixture exists; inspect before rerunning');
fs.mkdirSync(path.join(fixture,'old'),{recursive:true});
fs.writeFileSync(path.join(fixture,'old','test-boundary-909.txt'),'test');
fs.writeFileSync(config,JSON.stringify({schema:'desksom.file-index-poc/v1',root:fixture,db,allowedRoots:['C:\\Projects']}));
fs.writeFileSync(denied,JSON.stringify({schema:'desksom.file-index-poc/v1',root:'C:\\Windows',db:path.join(qa,'denied.sqlite'),allowedRoots:['C:\\Projects']}));
function command(action,cfg,extras=[]){
 const r=spawnSync(process.execPath,[engine,action,'--config',cfg,...extras],{encoding:'utf8',timeout:13000});
 return r;
}
const deniedRun=command('scan',denied);
assert.notEqual(deniedRun.status,0);
assert.match(deniedRun.stderr,/not inside an approved/i);
assert.ok(!fs.existsSync(path.join(qa,'denied.sqlite')));
const scan=command('scan',config);assert.equal(scan.status,0,scan.stderr);
const before=command('search',config,['--q','test-boundary-909']);assert.equal(before.status,0);
assert.equal(JSON.parse(before.stdout.trim()).results.length,1);
fs.renameSync(path.join(fixture,'old'),path.join(fixture,'archived-directory'));
fs.symlinkSync('C:\\Windows',path.join(fixture,'old'),'junction');
const after=command('search',config,['--q','test-boundary-909']);assert.equal(after.status,0);
const parsed=JSON.parse(after.stdout.trim());
assert.equal(parsed.results.length,0,'Should not return a cached file behind a replaced junction');
assert.equal(parsed.negativeAuthoritative,false);
const result={result:'POLICY_PASS',outOfScopeRootRejected:true,outOfScopeIndexCreated:false,stalePathJunctionSuppressed:true,missNotAuthoritative:true,serviceTouched:false};
fs.writeFileSync(path.join(qa,'POLICY_RESULTS.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
