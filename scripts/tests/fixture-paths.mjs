// Portable disposable test roots. Never use a developer's real project folders.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
export function fixturePrefix(name){
 if(typeof name!=='string'||!/^[a-z0-9-]{1,100}-$/.test(name))throw Error('INVALID_TEST_FIXTURE_PREFIX');
 const base=path.join(os.tmpdir(),'desksom-source-fixtures','ops');
 fs.mkdirSync(base,{recursive:true});
 // Resolve Windows short-name TEMP aliases before using strict path policies.
 return path.join(fs.realpathSync.native(base),name);
}
