import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {applyPdfFontOverlay,verifyPdfFontOverlay} from './pdf-font-overlay.mjs';
const relative='node_modules/@opendocsg/pdf2md/lib/util/pdf.js';
async function fixture(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'desksom-font-overlay-')),file=path.join(root,relative);await fs.mkdir(path.dirname(file),{recursive:true});
 const actual=await fs.readFile(path.join(import.meta.dirname,relative),'utf8');
 const original=actual.replace('    verbosity: 0,\n    fontExtraProperties: true,','    verbosity: 0,');
 await fs.writeFile(file,original);await fs.writeFile(path.join(root,'node_modules/@opendocsg/pdf2md/package.json'),JSON.stringify({version:'0.3.4'}));await fs.writeFile(path.join(root,'engine-overlay.json'),'{}');return {root,file};}
test('reviewed font overlay is byte-pinned, idempotent and verified before use',async()=>{
 const f=await fixture();try{await applyPdfFontOverlay(f.root);assert.equal(await verifyPdfFontOverlay(f.root),true);const first=await fs.readFile(f.file);await applyPdfFontOverlay(f.root);assert.deepEqual(await fs.readFile(f.file),first);
  await fs.appendFile(f.file,'\n// unexpected edit');await assert.rejects(()=>verifyPdfFontOverlay(f.root),/INTEGRITY_MISMATCH/);
 }finally{await fs.rm(f.root,{recursive:true,force:true})}
});
test('an unknown parser revision is not patched or accepted',async()=>{
 const f=await fixture();try{await fs.appendFile(f.file,'\n// unknown source');const before=await fs.readFile(f.file);await assert.rejects(()=>applyPdfFontOverlay(f.root),/INTEGRITY_MISMATCH/);assert.deepEqual(await fs.readFile(f.file),before);
 }finally{await fs.rm(f.root,{recursive:true,force:true})}
});
