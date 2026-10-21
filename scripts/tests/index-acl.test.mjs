import {fixturePrefix} from './fixture-paths.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {WindowsPlatform} from '../lib/windows.mjs';

test('new index databases inherit a private NTFS ACL',async()=>{
 const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
 const dir=await fs.mkdtemp(fixturePrefix('index-private-acl-'));
 const target=path.join(dir,'index-data');
 const platform=new WindowsPlatform(source);
 await platform.protectDirectory(target);
 const code=[
  "$ErrorActionPreference='Stop'",
  "$a=Get-Acl -LiteralPath '"+target.replace(/'/g,"''")+"'",
  "$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
  "$list=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))",
  "[pscustomobject]@{protected=$a.AreAccessRulesProtected;count=$list.Count;allowed=(@($list|Where-Object{$_.IdentityReference.Value -notin @($sid,'S-1-5-18')}).Count -eq 0);notInherited=(@($list|Where-Object{$_.IsInherited}).Count -eq 0)}|ConvertTo-Json -Compress"
 ].join(';');
 const base64=Buffer.from(code,'utf16le').toString('base64');
 const r=spawnSync('pwsh.exe',['-NoProfile','-NonInteractive','-EncodedCommand',base64],{encoding:'utf8',timeout:16000,maxBuffer:100000});
 assert.equal(r.status,0,r.stderr);
 const lines=r.stdout.split(/\r?\n/).filter(x=>x.trim().startsWith('{'));
 const result=JSON.parse(lines[0]);
 assert.equal(result.protected,true);assert.equal(result.count,2);
 assert.equal(result.allowed,true);assert.equal(result.notInherited,true);
 const testfile=path.join(target,'fixture.sqlite');
 await fs.writeFile(testfile,'private-fixture');
 assert.equal(await fs.readFile(testfile,'utf8'),'private-fixture');
 console.log(JSON.stringify({status:'PRIVATE_INDEX_ACL_PASS',folder:target,aclRules:result.count,sourceOnly:true}));
});
