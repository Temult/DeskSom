import test from 'node:test';
import assert from 'node:assert/strict';
import {coreTests,indexTests,selectTests} from '../lib/test-suites.mjs';
test('Node 22 qualifies core without pretending optional SQLite indexing was tested',()=>{
 const selection=selectTests('22.12.0');
 assert.deepEqual(selection.files,[...coreTests]);
 assert.equal(selection.indexIncluded,false);assert.equal(selection.coreIncluded,true);
 assert.throws(()=>selectTests('22.12.0','all'),/25/);
 assert.throws(()=>selectTests('22.12.0','index'),/25/);
});
test('Node 25 full qualification includes both resilience and ordinary suites once',()=>{
 const selection=selectTests('25.2.1');
 assert.equal(selection.indexIncluded,true);assert.equal(selection.coreIncluded,true);
 assert.equal(new Set(selection.files).size,selection.files.length);
 assert.ok(selection.files.includes('index-resilience.integration.test.mjs'));
 assert.ok(selection.files.includes('index-resilience.test.mjs'));
 assert.deepEqual(selectTests('25.2.1','core').files,[...coreTests]);
 assert.deepEqual(selectTests('25.2.1','index').files,[...indexTests]);
});
test('unsupported versions and unknown test modes are rejected',()=>{
 for(const version of ['21.9.0','22.0.0','22.11.9','not-a-version'])assert.throws(()=>selectTests(version));
 assert.throws(()=>selectTests('25.2.1','skip-everything'));
});
