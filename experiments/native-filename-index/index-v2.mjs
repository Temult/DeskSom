// Native file-name index v2: standalone/optional development tool, never a live rc.12 patch.
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {performance} from 'node:perf_hooks';

function error(message){throw Error(message)}
function norm(x){return path.win32.resolve(x).replace(/\\+$/,'').toLowerCase()}
function contains(root,p){const a=norm(root),b=norm(p);return b===a||b.startsWith(a+'\\')}
function params(argv){
 const v={};for(let i=0;i<argv.length;i+=2){
  if(!argv[i]?.startsWith('--')||!argv[i+1]||argv[i+1].startsWith('--'))error('Each option needs one value');
  const k=argv[i].slice(2);if(Object.hasOwn(v,k))error('Duplicate option: '+k);v[k]=argv[i+1];
 }return v;
}
const [command,...opts]=process.argv.slice(2),args=params(opts);
if(!['scan','search','status','walk'].includes(command))error('Command: scan, search, status, walk');
if(!args.config)error('Missing --config');
const cfg=JSON.parse(fs.readFileSync(args.config,'utf8'));
if(cfg.schema!=='desksom.index-v2/v1'||!Array.isArray(cfg.allowedRoots)||!cfg.allowedRoots.length||typeof cfg.root!=='string'||typeof cfg.database!=='string')error('Invalid configuration');
const root=fs.realpathSync.native(cfg.root);
if(!fs.statSync(root).isDirectory())error('Root not a directory');
const allowed=cfg.allowedRoots.map(x=>fs.realpathSync.native(x));
if(!allowed.some(a=>contains(a,root)))error('Index root is outside the currently approved file roots');
const dbPath=path.win32.resolve(cfg.database);
if(contains(root,dbPath))error('Index database must be outside the scan root');
const limitMs=Math.max(1000,Math.min(300000,Number(args['max-ms']??180000)));
const limitItems=Math.max(100,Math.min(800000,Number(args['max-items']??500000)));
const runAt=performance.now();
const expired=()=>performance.now()-runAt>=limitMs;
const show=o=>process.stdout.write(JSON.stringify(o)+'\n');
function safe(p) {
 if(!contains(root,p))return false;
 try{
  const st=fs.lstatSync(p);
  if(st.isSymbolicLink())return false;
  return contains(root,fs.realpathSync.native(p));
 }catch{return false}
}
function iterate(visitor,{bounded=true,filter}={}){
 const todo=[root], stats={entries:0,directories:0,skippedLinks:0,denied:0,limitReached:false,deniedExamples:[]};
 while(todo.length){
  if(bounded&&(expired()||stats.entries>=limitItems)){stats.limitReached=true;break}
  const dir=todo.pop();stats.directories++;
  let children;try{children=fs.readdirSync(dir,{withFileTypes:true});}catch(e){
   stats.denied++;if(stats.deniedExamples.length<3)stats.deniedExamples.push(e.code??'ERROR');continue;
  }
  for(const ent of children){
   if(ent.isSymbolicLink()){stats.skippedLinks++;continue}
   const full=path.join(dir,ent.name);
   if(!contains(root,full)){stats.denied++;continue}
   const kind=ent.isDirectory()?'d':ent.isFile()?'f':'o';
   if(kind==='o'){stats.skippedLinks++;continue}
   stats.entries++;
   if(!filter||filter(ent.name,full,kind))visitor(full,ent.name,kind);
   if(kind==='d')todo.push(full);
   if(bounded&&(expired()||stats.entries>=limitItems)){stats.limitReached=true;break}
  }
 }
 return {...stats,remainingDirs:todo.length,complete:!stats.limitReached&&stats.denied===0};
}
function validPositive(n,min,max,fallback){const v=Number(n??fallback);if(!Number.isSafeInteger(v)||v<min||v>max)error('Invalid numeric bound');return v}
function makeDb(dbfile){
 const db=new DatabaseSync(dbfile,{timeout:2500});
 db.exec('PRAGMA journal_mode=DELETE;PRAGMA synchronous=NORMAL;PRAGMA busy_timeout=2500;');
 db.exec('CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,val TEXT NOT NULL)');
 db.exec('CREATE TABLE IF NOT EXISTS entries(id INTEGER PRIMARY KEY, fullpath TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, kind TEXT NOT NULL)');
 db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS names_fts USING fts5(name,tokenize='trigram')");
 db.exec('CREATE INDEX IF NOT EXISTS ix_entry_name ON entries(name COLLATE NOCASE)');
 const read=db.prepare('SELECT val FROM meta WHERE key=?');
 const set=db.prepare('INSERT INTO meta(key,val) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET val=excluded.val');
 if(read.get('root')?.val&&read.get('root').val!==norm(root))error('Index database belongs to another root');
 return {db,read,set};
}
function runScan(){
 if(!Number.isFinite(limitMs)||!Number.isFinite(limitItems))error('Invalid budgets');
 const folder=path.dirname(dbPath);fs.mkdirSync(folder,{recursive:true});
 // Create-only on a new database. Rebuild uses a fresh temporary copy, never overwrites the old index on an incomplete attempt.
 const tmp=dbPath+'.build-'+process.pid+'-'+Date.now()+'.sqlite';
 if(fs.existsSync(tmp))error('Build destination collision');
 const {db,set}=makeDb(tmp);
 let done=false;
 try{
  const ins=db.prepare('INSERT INTO entries(fullpath,name,kind) VALUES(?,?,?)');
  const token=db.prepare('INSERT INTO names_fts(rowid,name) VALUES (?,?)');
  db.exec('BEGIN IMMEDIATE');
  const scan=iterate((p,name,kind)=>{
   const row=ins.run(norm(p),name,kind).lastInsertRowid;
   token.run(row,name);
  });
  const state=scan.complete?'COMPLETE_SNAPSHOT':'PARTIAL_SNAPSHOT';
  set.run('root',norm(root));set.run('state',state);set.run('count',String(scan.entries));
  set.run('lastScan',new Date().toISOString());set.run('links',String(scan.skippedLinks));set.run('denied',String(scan.denied));
  db.exec('COMMIT');db.close();
  // Avoid overwriting a live previous index; roll new index into place with preflighted backup and no active watcher.
  if(fs.existsSync(dbPath)){
   const old=dbPath+'.previous';
   if(fs.existsSync(old))error('An earlier backup exists. Reconcile it before rebuilding');
   fs.renameSync(dbPath,old);
   try{fs.renameSync(tmp,dbPath)}catch(e){fs.renameSync(old,dbPath);throw e}
  }else fs.renameSync(tmp,dbPath);
  done=true;
  return {status:state,root,entries:scan.entries,directories:scan.directories,skippedLinks:scan.skippedLinks,denied:scan.denied,remainingDirs:scan.remainingDirs,elapsedMs:Math.round(performance.now()-runAt),databaseBytes:fs.statSync(dbPath).size,absenceAuthoritative:false};
 }finally{if(!done)try{db.close()}catch{}}
}
function search(db,{all=false}={}){
 const q=args.q;
 if(typeof q!=='string'||q.length<1||q.length>256)error('--q required (1-256 chars)');
 const limit=validPositive(args.limit,1,100,30);
 const term=q.toLowerCase();
 const like='%'+term.replace(/[\\%_]/g,m=>'\\'+m)+'%';
 const started=performance.now();
 let rows=[],checked=0;
 const statement=[...term].length>=3?
  db.prepare("SELECT e.fullpath AS path,e.name,e.kind FROM names_fts t JOIN entries e ON e.id=t.rowid WHERE t.name LIKE ? ESCAPE '\\' LIMIT ?"):
  db.prepare("SELECT fullpath AS path,name,kind FROM entries WHERE name LIKE ? ESCAPE '\\' LIMIT ?");
 const batch=statement.all(like,limit*8);
 for(const r of batch){
  checked++;if(!safe(r.path))continue;
  rows.push(r);if(rows.length>=limit)break;
 }
 return {query:q,results:rows,matchesReturned:rows.length,checkedCandidates:checked,
   indexedQueryMs:Number((performance.now()-started).toFixed(3)),queryEngine:[...term].length>=3?'FTS5_TRIGRAM':'SHORT_NAME_SCAN'};
}
function readOnlyQuery(){
 if(!fs.existsSync(dbPath))error('Index not built');
 const {db,read}=makeDb(dbPath);
 try{
  const meta={state:read.get('state')?.val??'UNKNOWN',lastScan:read.get('lastScan')?.val??null};
  if(command==='status')return {root,db:dbPath,...meta,rowCount:db.prepare('SELECT COUNT(*) n FROM entries').get().n,databaseBytes:fs.statSync(dbPath).size,absenceAuthoritative:false};
  const result=search(db);
  result.indexState=meta.state;result.lastFullScan=meta.lastScan;result.negativeAuthoritative=false;result.missesVerified=false;
  if(result.results.length===0&&args['verify-miss']==='yes'){
   let candidates=[];
   const stats=iterate((p,name,kind)=>{if(name.toLowerCase().includes(args.q.toLowerCase())&&candidates.length<Number(args.limit??30))candidates.push({path:p,name,kind})},
      {filter:(name)=>name.toLowerCase().includes(args.q.toLowerCase())});
   result.fallback={entriesExamined:stats.entries,complete:stats.complete,denied:stats.denied};
   result.missesVerified=stats.complete;
   result.negativeAuthoritative=stats.complete&&candidates.length===0;
   if(candidates.length){result.results=candidates;result.queryEngine='FALLBACK_WALK'}
  }
  return result;
 }finally{db.close()}
}
function directWalk(){
 if(!args.q||args.q.length>256)error('Provide bounded --q');
 const matches=[];const q=args.q.toLowerCase(),max=validPositive(args.limit,1,100,30);
 const t=performance.now();
 const stats=iterate((p,n,k)=>{if(n.toLowerCase().includes(q)&&matches.length<max&&safe(p))matches.push({path:p,name:n,kind:k})},{filter:n=>n.toLowerCase().includes(q)});
 return {root,query:args.q,results:matches,elapsedMs:Math.round(performance.now()-t),...stats};
}
try{const answer=command==='scan'?runScan():command==='walk'?directWalk():readOnlyQuery();show(answer)}
catch(e){process.stderr.write(JSON.stringify({error:e.message,code:e.code??'SCAN_ERROR'})+'\n');process.exitCode=2}
