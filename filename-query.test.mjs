import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {filenameQuery} from './filename-query.mjs';
import {createFastFileSearch} from './fast-files.mjs';
const names=['Report.txt','foo_bar.txt','fooXbar.txt','100%done.txt','100Xdone.txt','name[1].txt',"quote's.txt",'back\\slash.txt','ab.txt','bracket].txt'];
function database(){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE entries(id INTEGER PRIMARY KEY,fullpath TEXT,name TEXT,kind TEXT);CREATE VIRTUAL TABLE names_fts USING fts5(name,tokenize=trigram)');for(const [i,name]of names.entries()){db.prepare('INSERT INTO entries VALUES(?,?,?,?)').run(i+1,'C:\\Fixture\\'+name,name,'f');db.prepare('INSERT INTO names_fts(rowid,name)VALUES(?,?)').run(i+1,name)}return db}
test('trigram anchor is indexed and literal percent/underscore remain literal',()=>{
 const db=database();try{for(const query of ['report','foo_bar','100%done',"quote'",'name[1]','back\\slash','ab','%','_']){
  const p=filenameQuery(query,100),rows=db.prepare(p.sql).all(...p.parameters);
  assert.deepEqual(rows.map(r=>r.name).sort(),names.filter(n=>n.toLowerCase().includes(query.toLowerCase())).sort(),query);
  const detail=db.prepare('EXPLAIN QUERY PLAN '+p.sql).all(...p.parameters).map(r=>r.detail).join(' ');
  if(p.strategy==='TRIGRAM')assert.match(detail,/L0/,'SQLite must receive an indexable LIKE constraint: '+detail);
 }}finally{db.close()}
});
test('SQL metacharacters remain bound values, not executable SQL',()=>{
 const db=database();try{const p=filenameQuery("';DROP TABLE entries;--",100);assert.equal(db.prepare(p.sql).all(...p.parameters).length,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM entries').get().n,names.length)}finally{db.close()}
});
test('bounded live search reports truncation and a case-only rename updates display names',{timeout:20000},async()=>{
 const base=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'desksom-query-'))),root=path.join(base,'allowed'),state=path.join(base,'private');fs.mkdirSync(root);fs.mkdirSync(state);
 for(let i=0;i<10;i++)fs.writeFileSync(path.join(root,'match-'+i+'.txt'),'fixture');
 const before=path.join(root,'mixedCase.txt'),after=path.join(root,'MIXEDCASE.txt');fs.writeFileSync(before,'case');
 const database=path.join(state,'index.sqlite'),index=createFastFileSearch({stateDir:state,allowedDirectories:[root],fastFilenameIndex:{enabled:true,selfHealing:true,periodicReconcileMs:300000,indices:[{root,database}]}});
 try{
  await index.ready();const limited=await index.search({root,query:'match-',limit:6});assert.equal(limited.structuredContent.results.length,6);assert.equal(limited.structuredContent.possibleTruncation,true);assert.equal(limited.structuredContent.queryStrategy,'TRIGRAM');
  fs.renameSync(before,after);await index.notifyCompletedWrite('move_file',{source:before,destination:after});
  const found=await index.search({root,query:'mixedcase'});assert.equal(found.structuredContent.results[0].name,'MIXEDCASE.txt');
  const miss=await index.search({root,query:'missing',verifyMiss:true});assert.equal(miss.structuredContent.repairStatus,'RECONCILED');assert.equal(miss.structuredContent.absenceAuthoritative,false);
 }finally{assert.equal((await index.stop()).status,'STOPPED');fs.rmSync(base,{recursive:true,force:true})}
});

test('an absent selected root is diagnostic only, not failure of other indices',{timeout:20000},async()=>{
 const base=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'desksom-missing-root-'))),good=path.join(base,'good'),missing=path.join(base,'missing'),state=path.join(base,'private');fs.mkdirSync(good);fs.mkdirSync(state);fs.writeFileSync(path.join(good,'present.txt'),'fixture');
 const cfg={stateDir:state,allowedDirectories:[good,missing],fastFilenameIndex:{enabled:true,selfHealing:true,periodicReconcileMs:300000,indices:[{root:good,database:path.join(state,'good.sqlite')},{root:missing,database:path.join(state,'missing.sqlite')}]}};
 const index=createFastFileSearch(cfg);try{
  const deadline=Date.now()+5000;while(!index.health(good)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,25));
  assert.equal(index.health(good),true);assert.equal(index.health(),false);assert.equal(index.snapshot().roots[1].state,'UNAVAILABLE');
  const found=await index.search({root:good,query:'present'});assert.equal(found.structuredContent.results.length,1);
  assert.equal((await index.search({root:missing,query:'anything'})).structuredContent.status,'ROOT_UNAVAILABLE');
  assert.equal(fs.existsSync(path.join(state,'missing.sqlite')),false);
  await assert.rejects(()=>index.ready(),/INDEX_WORKER_NOT_READY/);
 }finally{assert.equal((await index.stop()).status,'STOPPED');fs.rmSync(base,{recursive:true,force:true})}
});
