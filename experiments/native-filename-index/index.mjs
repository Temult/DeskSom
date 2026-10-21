// Native DeskSom filename-index prototype. Source-only, no service or cloud changes.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';

function fail(message) { throw new Error(message); }
function json(value) { process.stdout.write(JSON.stringify(value) + '\n'); }
function normalize(p) { return path.win32.normalize(path.win32.resolve(p)).replace(/[\\]+$/, '').toLowerCase(); }
function inside(p, root) { const a=normalize(p), b=normalize(root); return a===b || a.startsWith(b+'\\'); }
function existingReal(p) { return fs.realpathSync.native(p); }
function safeLike(s) { return s.replace(/[\\%_]/g, c=>'\\'+c); }
function options(args) {
  const out={};
  for(let i=0;i<args.length;i+=2) {
    if(!args[i]?.startsWith('--') || !args[i+1] || args[i+1].startsWith('--')) fail('Expected --name value arguments');
    if(Object.hasOwn(out,args[i].slice(2))) fail('Duplicate option');
    out[args[i].slice(2)]=args[i+1];
  }
  return out;
}
const [command,...rest]=process.argv.slice(2);
const args=options(rest);
if(!['scan','search','status','watch'].includes(command)) fail('Use scan, search, status or watch.');
if(!args.config) fail('--config is required.');
const cfg=JSON.parse(fs.readFileSync(args.config,'utf8'));
if(cfg.schema!=='desksom.file-index-poc/v1' || typeof cfg.root!=='string' ||
   typeof cfg.db!=='string' || !Array.isArray(cfg.allowedRoots) || cfg.allowedRoots.length===0) fail('Invalid scope configuration');
const root=existingReal(cfg.root);
if(!fs.statSync(root).isDirectory()) fail('Index root is not a directory');
const allowed=cfg.allowedRoots.map(existingReal);
if(!allowed.some(p=>inside(root,p))) fail('Requested index root is not inside an approved file-tool root');
if(inside(cfg.db,root)) fail('The index database must live outside the scanned directory');
if(!fs.existsSync(cfg.db) && command!=='scan' && command!=='watch') fail('Index does not exist yet');
fs.mkdirSync(path.dirname(cfg.db),{recursive:true});
const db=new DatabaseSync(cfg.db,{timeout:3000});
db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=3000;");
db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, val TEXT NOT NULL)");
db.exec("CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY, fullpath TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, kind TEXT NOT NULL, size INTEGER, mtime_ms REAL)");
db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS trigram USING fts5(fullpath UNINDEXED, name, tokenize='trigram')");
db.exec("CREATE INDEX IF NOT EXISTS entries_name_nocase ON entries(name COLLATE NOCASE)");
const readMeta=db.prepare('SELECT val FROM meta WHERE key=?');
const setMeta=db.prepare('INSERT INTO meta(key,val) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET val=excluded.val');
const getEntry=db.prepare('SELECT id FROM entries WHERE fullpath=?');
const insert=db.prepare('INSERT INTO entries(fullpath,name,kind,size,mtime_ms) VALUES(?,?,?,?,?)');
const update=db.prepare('UPDATE entries SET name=?,kind=?,size=?,mtime_ms=? WHERE id=?');
const ftsInsert=db.prepare('INSERT INTO trigram(rowid,fullpath,name) VALUES (?,?,?)');
const ftsDelete=db.prepare('DELETE FROM trigram WHERE rowid=?');
const remove=db.prepare('DELETE FROM entries WHERE id=?');
const subtree=db.prepare("SELECT id FROM entries WHERE fullpath=? OR fullpath LIKE ? ESCAPE '^'");
const rootCanonical=normalize(root);
const previous=readMeta.get('root');
if(previous && previous.val!==rootCanonical) fail('Index belongs to a different root; refusing to reuse it');
setMeta.run('root',rootCanonical);
const meta=(k)=>readMeta.get(k)?.val??null;
const mark=(state,reason='')=>{setMeta.run('state',state);setMeta.run('reason',reason);setMeta.run('updated',new Date().toISOString());};
function checkPath(candidate) {
 if(!inside(candidate,root)) fail('Path escaped selected root');
 const info=fs.lstatSync(candidate);
 if(info.isSymbolicLink()) return null; // includes Windows junctions/reparse links
 if(!inside(existingReal(candidate),root)) return null;
 return info;
}
function removeTree(p) {
 const key=p.toLowerCase();
 const ids=subtree.all(key,key.replace(/[\^%_]/g,c=>'^'+c)+'\\%').map(x=>x.id);
 for(const id of ids){ftsDelete.run(id);remove.run(id);}
 return ids.length;
}
function addOne(p,st) {
 const kind=st.isDirectory()?'directory':st.isFile()?'file':'other';
 if(kind==='other') return;
 const key=p.toLowerCase(), name=path.basename(p);
 let id=getEntry.get(key)?.id;
 if(id){ftsDelete.run(id);update.run(name,kind,st.size,st.mtimeMs,id);}
 else {id=Number(insert.run(key,name,kind,st.size,st.mtimeMs).lastInsertRowid);}
 ftsInsert.run(id,key,name);
}
function walk(start, onEntry, counters) {
 const queue=[start];
 while(queue.length) {
   const current=queue.pop();
   let st;try{st=checkPath(current)}catch(e){if(e.code==='ENOENT')continue;throw e;}
   if(!st){counters.skippedLinks++;continue;}
   if(current!==root){onEntry(current,st);counters.entries++;}
   if(!st.isDirectory())continue;
   const children=fs.readdirSync(current,{withFileTypes:true});
   for(const c of children) queue.push(path.join(current,c.name));
 }
}
function transact(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
function fullScan(){
 mark('SCANNING');
 const counts={entries:0,skippedLinks:0};
 const begin=performance.now();
 try{
  transact(()=>{
    db.exec('DELETE FROM trigram; DELETE FROM entries');
    walk(root,addOne,counts);
    setMeta.run('lastScan',new Date().toISOString());
    setMeta.run('lastCount',String(counts.entries));
  });
  mark('SNAPSHOT','Full scan completed; absence must still be verified if index may be stale');
  return {result:'SCAN_PASS',root,elapsedMs:Math.round(performance.now()-begin),...counts,dbBytes:fs.statSync(cfg.db).size};
 }catch(e){mark('STALE','Scan failed: '+e.code);throw e;}
}
function status(){
 return {root,db:cfg.db,state:meta('state')==='WATCHING'?'WATCH_SESSION_UNVERIFIED':(meta('state')??'UNINITIALIZED'),reason:meta('reason'),lastScan:meta('lastScan'),rows:db.prepare('SELECT COUNT(*) AS n FROM entries').get().n,dbBytes:fs.statSync(cfg.db).size,absenceAuthoritative:false};
}
function find(q,limit){
 const name=q.toLowerCase();
 // For >=3 characters, SQLite FTS5's trigram index accelerates contains queries.
 const useTrigram=[...name].length>=3;
 let rows;
 const like='%'+safeLike(name)+'%';
 if(useTrigram){
  rows=db.prepare("SELECT e.fullpath AS path,e.kind,e.size,e.mtime_ms AS mtimeMs FROM trigram AS t JOIN entries AS e ON e.id=t.rowid WHERE t.name LIKE ? ESCAPE '\\' ORDER BY e.fullpath LIMIT ?").all(like,limit);
 }else{
  rows=db.prepare("SELECT fullpath AS path,kind,size,mtime_ms AS mtimeMs FROM entries WHERE name LIKE ? ESCAPE '\\' ORDER BY fullpath LIMIT ?").all(like,limit);
 }
 return {results:rows.filter(row=>{try{return !!checkPath(row.path);}catch{return false;}}),queryEngine:useTrigram?'FTS5_TRIGRAM':'SQLITE_SHORT_TERM_SCAN'};
}
function query(){
 if(typeof args.q!=='string' || args.q.length<1 || args.q.length>256) fail('--q must be 1..256 characters');
 const limit=Math.min(200,Math.max(1,Number(args.limit??50)));
 if(!Number.isInteger(limit))fail('Invalid limit');
 const start=performance.now();
 let found=find(args.q,limit);
 let fallback='NOT_RUN';
 if(found.results.length===0 && args['verify-misses']==='yes'){
  const counts={entries:0,skippedLinks:0}, hits=[];
  walk(root,(p,st)=>{
   if(path.basename(p).toLowerCase().includes(args.q.toLowerCase()) && hits.length<limit)
    hits.push({path:p.toLowerCase(),kind:st.isDirectory()?'directory':'file',size:st.size,mtimeMs:st.mtimeMs});
  },counts);
  fallback='FULL_WALK_COMPLETE';
  if(hits.length)found={...found,results:hits,queryEngine:'FALLBACK_FS_WALK'};
 }
 return {query:args.q,limit,...found,elapsedMs:Number((performance.now()-start).toFixed(3)),indexState:meta('state')==='WATCHING'?'WATCH_SESSION_UNVERIFIED':meta('state'),lastFullScan:meta('lastScan'),missVerifiedByTraversal:fallback==='FULL_WALK_COMPLETE',negativeAuthoritative:fallback==='FULL_WALK_COMPLETE',fallback,root};
}
function updatePath(p){
 // Only concrete inside-root paths; full directory contents reconciled on a rename/create.
 if(!inside(p,root))return;
 let st;
 try{st=checkPath(p);}catch(e){if(e.code!=='ENOENT'){mark('STALE','File watcher update failure: '+e.code);return;}}
 try{
  transact(()=>{
   removeTree(p);
   if(st){const counts={entries:0,skippedLinks:0};walk(p,addOne,counts);}
  });
 }catch(e){mark('STALE','Watcher update transaction failed: '+e.code);}
}
async function watch(){
 let pending=new Set(),scheduled=null,failed=false;
 function flush(){
   const items=[...pending];pending.clear();scheduled=null;
   for(const item of items)updatePath(item);
   if(!failed && meta('state')!=='STALE')mark('WATCHING','Events applied; loss during downtime cannot be ruled out');
 }
 let watcher;
 try{
   // Native recursive Windows watching, installed BEFORE the full baseline scan.
   watcher=fs.watch(root,{recursive:true},(event,filename)=>{
    if(!filename){failed=true;mark('STALE','Watcher delivered an event without a filename');return;}
    const full=path.resolve(root,String(filename));
    if(inside(full,root))pending.add(event==='rename'?path.dirname(full):full);
    if(!scheduled)scheduled=setTimeout(flush,75);
   });
   watcher.on('error',e=>{failed=true;mark('STALE','Watcher failed: '+e.code);});
   json({event:'WATCHER_ATTACHED',root});
   json({event:'BASELINE',...fullScan()});
   mark('WATCHING','Watcher attached before scan; best-effort notifications, not a guarantee of complete absence');
   process.on('SIGINT',()=>{if(scheduled)clearTimeout(scheduled);watcher.close();mark('STALE','Watcher stopped');db.close();process.exit(0);});
   process.stdin.resume();
   process.stdin.on('end',()=>{watcher.close();mark('STALE','Watcher exited');db.close();});
 }catch(e){watcher?.close();mark('STALE','Could not start watcher');throw e;}
}
try{
 if(command==='scan')json(fullScan());
 if(command==='status')json(status());
 if(command==='search')json(query());
 if(command==='watch')await watch();
 if(command!=='watch')db.close();
}catch(e){
 try{mark('STALE','Command failure: '+(e.code??'ERROR'));db.close();}catch{}
 process.stderr.write(JSON.stringify({error:e.message,code:e.code??'INDEX_ERROR'})+'\n');
 process.exitCode=2;
}
