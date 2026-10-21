// Maintainer tool for a new reviewed release, never an installation repair.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {safeRelative} from './lib/common.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.slice(2).join(' ')!=='--reviewed-source'){
  console.error('Maintainer-only: review the source and use --reviewed-source. Never reseal a user installation.');
  process.exit(1);
}
const names=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8',shell:false}).split('\0').filter(Boolean))];
const forbidden=/(^|\/)(node_modules|bin|logs|download-cache|npm-cache|\.git)(\/|$)|(^|\/)(settings|connection|install|dependencies)\.json$|\.(dpapi|pem|pfx|key|log|zip|xml)$/i;
const files=[];const seen=new Set();
for(const name of names.sort()){
  // Previously published binary downloads have their own immutable hash receipts.
  // Preserve them in Git but never mix them into this release's source manifest.
  if(name==='release-manifest.json'||name.startsWith('downloads/'))continue;
  safeRelative(name);
  if(forbidden.test(name)||seen.has(name.toLowerCase()))throw new Error('Unsafe or duplicate public source path: '+name);
  seen.add(name.toLowerCase());
  const full=path.join(root,name),stat=await fs.lstat(full);
  if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Expected a regular source file: '+name);
  const bytes=await fs.readFile(full);
  files.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const pkg=JSON.parse((await fs.readFile(path.join(root,'package.json'),'utf8')).replace(/^\uFEFF/,''));
const manifest={schemaVersion:'desksom.release/v1',version:pkg.version,files};
await fs.writeFile(path.join(root,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({sealed:true,version:pkg.version,fileCount:files.length,note:'A checksum manifest is not a publisher signature.'}));
