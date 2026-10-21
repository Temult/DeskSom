import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {selectTests} from './lib/test-suites.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(args.length!==0&&(args.length!==2||args[0]!=='--mode'))throw Error('Use --mode auto, core, index or all');
const selected=selectTests(process.versions.node,args[1]??'auto');
console.log(JSON.stringify({event:'TEST_SELECTION',node:process.versions.node,coreIncluded:selected.coreIncluded,
 indexIncluded:selected.indexIncluded,indexReason:selected.indexReason,fileCount:selected.files.length}));
const child=spawn(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',...selected.files],{
 cwd:root,shell:false,windowsHide:true,stdio:'inherit'});
child.once('error',error=>{console.error('Test runner did not start: '+error.code);process.exitCode=1});
child.once('exit',(code,signal)=>{
 if(signal)console.error('Tests were interrupted; no passing qualification is claimed.');
 process.exitCode=code??1;
});
