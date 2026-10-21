import test from 'node:test';import assert from 'node:assert/strict';
import {createConcurrencyGate} from './concurrency.mjs';
test('queued Git work retains its slot under contention and failures',{timeout:5000},async()=>{
 const gate=createConcurrencyGate(3);let active=0,maximum=0,completed=0;const started=[];
 const jobs=Array.from({length:120},(_,i)=>gate(async()=>{
  active++;maximum=Math.max(maximum,active);started.push(i);
  try{await new Promise(resolve=>setImmediate(resolve));if(i%17===0)throw Error('fixture');return i}
  finally{active--;completed++}
 }));
 const results=await Promise.allSettled(jobs);assert.equal(maximum,3);assert.equal(active,0);assert.equal(completed,120);
 assert.deepEqual(started,Array.from({length:120},(_,i)=>i));assert.equal(results.filter(x=>x.status==='rejected').length,8);
 assert.equal(await gate(()=>42),42);
});
test('concurrency gate rejects invalid bounds',()=>{for(const n of [0,-1,1.5,NaN,Infinity])assert.throws(()=>createConcurrencyGate(n),TypeError)});
