import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRootsChange,stripDisabledIndex} from '../lib/roots.mjs';
import {hashObject,DeskSomError} from '../lib/common.mjs';

const baseline={
 installationId:'8fd05014-a028-43d1-a8ee-123456789abc',
 planSha256:'a'.repeat(64),plan:{allowedDirectories:['c:\\projects','d:\\workspace']},
 rootsRevision:0
};
const code=n=>e=>e instanceof DeskSomError&&e.code===n;

test('adds and removes folders in a SHA-256-bound proposal without editing the sealed plan',()=>{
 const p=makeRootsChange(baseline,{addDirectories:['E:\\School Projects'],removeDirectories:['D:\\Workspace']});
 assert.equal(p.approvalSha256.length,64);
 const {approvalSha256,...rest}=p;
 assert.equal(hashObject(rest),approvalSha256);
 assert.deepEqual(p.currentDirectories,['c:\\projects','d:\\workspace']);
 assert.deepEqual(p.nextDirectories,['c:\\projects','e:\\school projects']);
 assert.equal(p.requiresServiceRestart,true);
 assert.equal(p.terminalPermissionsUnchanged,true);
 assert.deepEqual(baseline.plan.allowedDirectories,['c:\\projects','d:\\workspace']);
});
test('revisions and installation identities prevent stale or foreign proposals',()=>{
 const first=makeRootsChange(baseline,{addDirectories:['e:\\foo']});
 const another=makeRootsChange({...baseline,rootsRevision:1},{addDirectories:['e:\\foo']});
 const foreign=makeRootsChange({...baseline,installationId:'foreign'},{addDirectories:['e:\\foo']});
 assert.notEqual(first.approvalSha256,another.approvalSha256);
 assert.notEqual(first.approvalSha256,foreign.approvalSha256);
});
test('folder changes refuse no-ops, unknown removals, duplicates and last-root removal',()=>{
 assert.throws(()=>makeRootsChange(baseline,{}),code('ROOTS_REQUEST_INVALID'));
 assert.throws(()=>makeRootsChange(baseline,{addDirectories:['C:\\Projects']}),code('ROOT_ALREADY_ALLOWED'));
 assert.throws(()=>makeRootsChange(baseline,{removeDirectories:['E:\\Unknown']}),code('ROOT_NOT_ALLOWED'));
 assert.throws(()=>makeRootsChange(baseline,{addDirectories:['E:\\Same'],removeDirectories:['E:\\Same']}),code('ROOT_NOT_ALLOWED'));
 assert.throws(()=>makeRootsChange({...baseline,plan:{allowedDirectories:['c:\\projects']}},{removeDirectories:['C:\\Projects']}),code('ROOTS_REQUIRED'));
});
test('folder updates reject unsafe paths and unknown specification keys',()=>{
 for(const x of ['C:\\','\\\\server\\share','C:\\Windows\\..\\Temp','relative','C:\\work:stream'])
  assert.throws(()=>makeRootsChange(baseline,{addDirectories:[x]}));
 assert.throws(()=>makeRootsChange(baseline,{replaceDirectories:['C:\\Work']}),code('INVALID_INPUT'));
 assert.throws(()=>makeRootsChange(baseline,{addDirectories:[4]}),code('ROOTS_REQUEST_INVALID'));
});

test('a disabled index profile is cleared when folder policy changes',()=>{
 const disabled={...baseline,indexProfile:{enabled:false,rootsRevision:0}};
 const revised=stripDisabledIndex({...disabled,rootsRevision:1});
 assert.equal(revised.indexProfile,undefined);
 const active={...baseline,indexProfile:{enabled:true,rootsRevision:0}};
 assert.equal(stripDisabledIndex(active).indexProfile.enabled,true);
 assert.equal(makeRootsChange(disabled,{addDirectories:['E:\\New']} ).schemaVersion,'desksom.roots-change/v1');
});
