import {fixturePrefix} from './fixture-paths.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {startSelfHealingIndex} from '../../self-healing-client.mjs';
import {createFastFileSearch} from '../../fast-files.mjs';

function fixture(){
 const base=fs.mkdtempSync(fixturePrefix('self-healing-r7-review-'));
 const root=path.join(base,'fixture'),state=path.join(base,'state'),dir=path.join(state,'indices');
 fs.mkdirSync(root);fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(root,'r7-positive.txt'),'disposable');
 return {base,root,state,db:path.join(dir,'test.sqlite')};
}
const input=f=>({root:f.root,database:f.db,privateState:f.state,periodicReconcileMs:300000,fixtureOnly:true});
const config=f=>({stateDir:f.state,allowedDirectories:[f.root],fastFilenameIndex:{enabled:true,selfHealing:true,
  periodicReconcileMs:300000,indices:[{root:f.root,database:f.db}]}});
test('review r7: graceful indexed shutdown releases lease and enables a second writer',async()=>{
 const f=fixture();
 const one=createFastFileSearch(config(f));
 assert.equal((await one.ready()).status,'READY');
 assert.equal((await one.search({root:f.root,query:'r7-positive'})).structuredContent.results.length,1);
 const lock=f.db+'.writer-lock';
 assert.equal(fs.existsSync(lock),true);
 assert.equal((await one.stop()).status,'STOPPED');
 assert.equal(fs.existsSync(lock),false);
 const two=createFastFileSearch(config(f));
 assert.equal((await two.ready()).status,'READY');
 assert.equal((await two.search({root:f.root,query:'r7-positive'})).structuredContent.results.length,1);
 assert.equal((await two.stop()).status,'STOPPED');
 assert.equal(fs.existsSync(lock),false);
});
test('review r7: crashed writer never exposes stale search or steals a lease',async()=>{
 const f=fixture();
 const one=startSelfHealingIndex(input(f));
 assert.equal((await one.whenReady()).status,'READY');
 const lock=f.db+'.writer-lock';
 assert.equal(fs.existsSync(lock),true);
 await one.terminateForFixture();
 assert.equal(one.latest,'FAILED');
 const second=createFastFileSearch(config(f));
 await assert.rejects(()=>second.ready(),/INDEX_WORKER_NOT_READY/);
 const response=await second.search({root:f.root,query:'r7-positive'});
 assert.equal(response.structuredContent.status,'INDEX_WORKER_UNAVAILABLE');
 assert.equal(response.structuredContent.absenceAuthoritative,false);
 assert.equal(fs.existsSync(lock),true,'Crash-held lock must not be removed automatically');
 assert.equal((await second.stop()).status,'UNCONFIRMED');
});
