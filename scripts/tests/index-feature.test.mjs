import test from 'node:test';
import assert from 'node:assert/strict';
import {makeIndexFeatureProfile,profileToBrokerSettings} from '../lib/index-profile.mjs';
import {settings} from '../lib/install-core.mjs';
import {makeRootsChange} from '../lib/roots.mjs';

const installation={
 installationId:'fixture-owned-id',planSha256:'fixture-hash',
 rootsRevision:2,
 activeAllowedDirectories:['c:\\dl','c:\\projects'],
 plan:{stateRoot:'C:\\Users\\test\\AppData\\Local\\DeskSom\\fixture',
  binding:{host:'DESKTOP-QA'},port:18789,
  allowedDirectories:['c:\\dl','c:\\projects'],instance:'fixture',
  sourceFingerprint:'test'}
};
test('owner opt-in only chooses installed approved roots with private deterministic paths',()=>{
 const p=makeIndexFeatureProfile(installation,{enabled:true,roots:['C:\\DL'],periodicMinutes:30});
 assert.equal(p.enabled,true);assert.equal(p.indices.length,1);assert.equal(p.rootsRevision,2);
 assert.ok(p.indices[0].database.startsWith('c:\\users\\test\\appdata\\local\\desksom\\fixture\\indices\\'));
 assert.deepEqual(profileToBrokerSettings(installation,p),{enabled:true,selfHealing:true,periodicReconcileMs:1800000,indices:p.indices});
});
test('no opt-in defaults to no feature and a disabled profile has no indexed roots',async()=>{
 const plain=await settings(installation);
 assert.ok(!Object.hasOwn(plain,'fastFilenameIndex'));
 const disabled=makeIndexFeatureProfile(installation,{enabled:false,roots:[]});
 assert.deepEqual(profileToBrokerSettings(installation,disabled),{enabled:false,selfHealing:false,periodicReconcileMs:1800000,indices:[]});
});
test('reject unauthorized roots and invalid intervals',()=>{
 assert.throws(()=>makeIndexFeatureProfile(installation,{enabled:true,roots:['C:\\Windows']}),/INDEX_ROOT_NOT_APPROVED/);
 assert.throws(()=>makeIndexFeatureProfile(installation,{enabled:true,roots:['C:\\DL'],periodicMinutes:1}),/INDEX_PERIOD_OUT_OF_RANGE/);
 assert.throws(()=>makeIndexFeatureProfile(installation,{enabled:true,roots:['C:\\DL','c:\\dl']}),/INDEX_SELECTED_ROOTS_DUPLICATED/);
 assert.throws(()=>makeIndexFeatureProfile(installation,{enabled:false,roots:['C:\\DL']}),/INDEX_DISABLED_WITH_ROOTS/);
});
test('reject stale root revision and changed digest before activating feature',()=>{
 const p=makeIndexFeatureProfile(installation,{enabled:true,roots:['C:\\DL']});
 assert.throws(()=>profileToBrokerSettings({...installation,rootsRevision:3},p),/INDEX_PROFILE_STALE_OR_CHANGED/);
 assert.throws(()=>profileToBrokerSettings({...installation,activeAllowedDirectories:['c:\\projects']},p),/INDEX_ROOT_NOT_APPROVED/);
 assert.throws(()=>profileToBrokerSettings(installation,{...p,periodicReconcileMs:500000}),/INDEX_PROFILE_HASH_MISMATCH/);
});
test('settings produces exactly derived read-only profile when approved',async()=>{
 const p=makeIndexFeatureProfile(installation,{enabled:true,roots:['C:\\DL']});
 const settingsWith=await settings({...installation,indexProfile:p});
 assert.equal(settingsWith.fastFilenameIndex.indices[0].root,'c:\\dl');
 assert.equal(settingsWith.fastFilenameIndex.selfHealing,true);
});

test('changing approved roots is blocked while indexed search is enabled',()=>{
 const p=makeIndexFeatureProfile(installation,{enabled:true,roots:['C:\\DL']});
 assert.throws(()=>makeRootsChange({...installation,indexProfile:p},{addDirectories:['C:\\Extra']}),/Turn off indexed filename search/);
});
