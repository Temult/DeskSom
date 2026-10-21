// @opendocsg/pdf2md 0.3.4 expects the PDF.js font name, which newer unpdf
// omits unless fontExtraProperties is explicitly enabled. Keep this one-option
// compatibility overlay pinned and verified; never substitute fake font names.
import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
const relative='node_modules/@opendocsg/pdf2md/lib/util/pdf.js';
const originalSha='04e42b2ef2f78cf80405b7b2ba30fbd9e64b6bcf6bfa1bf7afe6385452690074';
const reviewedPatchedSha='2ea6df3a8cb714c1cda454759e009151f9b1abbfeb35f33f632f64e57495ba87';
const from='    verbosity: 0,',to='    verbosity: 0,\n    fontExtraProperties: true,';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function applyPdfFontOverlay(root){
 const file=path.join(root,relative),recordPath=path.join(root,'engine-overlay.json');
 const version=JSON.parse(await fs.readFile(path.join(root,'node_modules/@opendocsg/pdf2md/package.json'),'utf8')).version;
 if(version!=='0.3.4')throw Error('PDF_FONT_OVERLAY_UNREVIEWED_VERSION');
 const overlay=JSON.parse(await fs.readFile(recordPath,'utf8')),bytes=await fs.readFile(file),current=hash(bytes);
 if(current===originalSha){
  const text=bytes.toString('utf8');if(text.split(from).length!==2)throw Error('PDF_FONT_OVERLAY_ANCHOR_MISMATCH');
  const changed=text.replace(from,to),patchedSha=hash(changed);
  if(patchedSha!==reviewedPatchedSha)throw Error('PDF_FONT_OVERLAY_PATCH_HASH_MISMATCH');
  await fs.writeFile(file,changed);
  overlay.pdfFontProperties={package:'@opendocsg/pdf2md',version,target:relative,original_sha256:originalSha,
   patched_sha256:patchedSha,purpose:'Enable real font metadata required by existing Markdown transformations'};
  await fs.writeFile(recordPath,JSON.stringify(overlay,null,2));
 }else if(overlay.pdfFontProperties?.original_sha256!==originalSha||current!==overlay.pdfFontProperties?.patched_sha256)
  throw Error('PDF_FONT_OVERLAY_INTEGRITY_MISMATCH');
 await verifyPdfFontOverlay(root,overlay);
}
export async function verifyPdfFontOverlay(root,provided){
 const overlay=provided??JSON.parse(await fs.readFile(path.join(root,'engine-overlay.json'),'utf8'));
 const record=overlay.pdfFontProperties;
 if(record?.target!==relative||record.original_sha256!==originalSha||record.version!=='0.3.4'||record.patched_sha256!==reviewedPatchedSha||
  hash(await fs.readFile(path.join(root,relative)))!==record.patched_sha256)
  throw Error('PDF_FONT_OVERLAY_INTEGRITY_MISMATCH');
 return true;
}
