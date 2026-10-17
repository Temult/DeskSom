import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRelease, redactedError} from './lib/common.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
try {
  const release=await loadRelease(root);
  const forbidden=/(^|\/)(node_modules|bin|logs|download-cache|npm-cache|\.git)(\/|$)|(^|\/)(settings|connection|install|dependencies)\.json$|\.(dpapi|pem|pfx|key|log|zip|xml)$/i;
  for(const entry of release.manifest.files){
    if(forbidden.test(entry.path))throw new Error('Private artifact in source manifest');
  }
  for(const required of ['AGENTS.md','AI_INSTALL.md','README.md','Start-DeskSom.cmd','scripts/cli.mjs','scripts/lib/install-core.mjs']){
    if(!release.manifest.files.some(entry=>entry.path===required))throw new Error('Required AI-first entry point absent');
  }
  process.stdout.write(JSON.stringify({schemaVersion:'desksom.release-check/v1',passed:true,version:release.manifest.version,fileCount:release.manifest.files.length,sourceFingerprint:release.fingerprint})+'\n');
} catch(error) {
  process.stdout.write(JSON.stringify({schemaVersion:'desksom.release-check/v1',passed:false,error:redactedError(error)})+'\n');
  process.exitCode=1;
}
