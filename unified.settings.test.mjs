import test from 'node:test';
import assert from 'node:assert/strict';
import {settings} from './scripts/lib/install-core.mjs';
import {makeIndexFeatureProfile} from './scripts/lib/index-profile.mjs';
const root=String.raw`C:\Fixtures\UnifiedProject`;
const stateRoot=String.raw`C:\Private\DeskSom\unified`;
function state(){
 return {installationId:'11111111-1111-4111-8111-111111111111',planSha256:'f'.repeat(64),rootsRevision:2,
  plan:{stateRoot,allowedDirectories:[root],port:19788,instance:'unified',sourceFingerprint:'a'.repeat(64),
   binding:{host:'DESKTOP-QA'}},projectInspectEnabled:false};
}
test('independent default-off flags and state-to-broker profile persistence',async()=>{
 const s=state();
 const off=await settings(s);
 assert.equal(off.enableProjectInspect,false);
 assert.equal(off.fastFilenameIndex,undefined);
 s.projectInspectEnabled='true';
 assert.equal((await settings(s)).enableProjectInspect,false,'truthy string cannot enable inspection');
 s.projectInspectEnabled=true;
 const inspect=await settings(s);
 assert.equal(inspect.enableProjectInspect,true);
 assert.equal(inspect.fastFilenameIndex,undefined);
 s.indexProfile=makeIndexFeatureProfile(s,{enabled:true,roots:[root],periodicMinutes:30});
 const both=await settings(s);
 assert.equal(both.enableProjectInspect,true);
 assert.equal(both.fastFilenameIndex.enabled,true);
 assert.equal(both.fastFilenameIndex.indices.length,1);
 const baselineIndex=JSON.stringify(both.fastFilenameIndex);
 s.projectInspectEnabled=false;
 const indexOnly=await settings(s);
 assert.equal(indexOnly.enableProjectInspect,false);
 assert.equal(JSON.stringify(indexOnly.fastFilenameIndex),baselineIndex,'inspection flag must not mutate selected index');
 s.projectInspectEnabled=true;
 s.indexProfile=makeIndexFeatureProfile(s,{enabled:false,roots:[],periodicMinutes:30});
 const inspectOnly=await settings(s);
 assert.equal(inspectOnly.enableProjectInspect,true);
 assert.equal(inspectOnly.fastFilenameIndex.enabled,false);
 assert.equal(inspectOnly.fastFilenameIndex.indices.length,0);
 assert.deepEqual(inspectOnly.allowedDirectories,[root]);
 assert.equal(inspectOnly.rootsRevision,2);
});
