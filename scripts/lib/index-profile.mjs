// Development-only owner index-option planner. NO state changes.
import path from 'node:path';
import {createHash} from 'node:crypto';

const normalize=x=>path.win32.resolve(x).replace(/\\+$/,'').toLowerCase();
function invalid(code){throw Object.assign(new Error(code),{code})}
const stable=x=>JSON.stringify(x);
export function makeIndexFeatureProfile(installation,request){
 if(!installation||!installation.plan||typeof installation.installationId!=='string')invalid('INDEX_INSTALL_IDENTITY_REQUIRED');
 if(!request||typeof request!=='object'||Array.isArray(request))invalid('INDEX_REQUEST_INVALID');
 if(Object.keys(request).some(k=>!['enabled','roots','periodicMinutes'].includes(k)))invalid('INDEX_REQUEST_UNKNOWN_FIELD');
 if(typeof request.enabled!=='boolean')invalid('INDEX_ENABLED_BOOLEAN_REQUIRED');
 const approved=installation.activeAllowedDirectories??installation.plan.allowedDirectories;
 if(!Array.isArray(approved)||!approved.length)invalid('INDEX_ALLOWED_ROOTS_MISSING');
 const normalized=approved.map(normalize);
 if(new Set(normalized).size!==normalized.length)invalid('INDEX_ALLOWED_ROOTS_DUPLICATED');
 let roots=[];
 if(request.enabled){
  if(!Array.isArray(request.roots)||request.roots.length<1||request.roots.length>8)invalid('INDEX_SELECTED_ROOTS_INVALID');
  roots=request.roots.map(x=>{if(typeof x!=='string'||!path.win32.isAbsolute(x))invalid('INDEX_ROOT_PATH_INVALID');return normalize(x)});
  if(new Set(roots).size!==roots.length)invalid('INDEX_SELECTED_ROOTS_DUPLICATED');
  if(roots.some(x=>!normalized.includes(x)))invalid('INDEX_ROOT_NOT_APPROVED');
 }else if(Array.isArray(request.roots)&&request.roots.length)invalid('INDEX_DISABLED_WITH_ROOTS');
 const minutes=request.periodicMinutes??30;
 if(!Number.isSafeInteger(minutes)||minutes<5||minutes>1440)invalid('INDEX_PERIOD_OUT_OF_RANGE');
 const privateRoot=normalize(installation.plan.stateRoot);
 if(!path.win32.isAbsolute(privateRoot)||normalized.some(x=>privateRoot===x||privateRoot.startsWith(x+'\\')))invalid('INDEX_STATE_NOT_PRIVATE');
 const indices=roots.sort().map(root=>{
  const key=createHash('sha256').update(root,'utf8').digest('hex').slice(0,24);
  return {root,database:path.win32.join(privateRoot,'indices',key+'.sqlite')};
 });
 const profile={
  schema:'desksom.index-feature-profile/v1',
  installationId:installation.installationId,
  planSha256:installation.planSha256,
  rootsRevision:installation.rootsRevision??0,
  enabled:request.enabled,
  periodicReconcileMs:minutes*60000,
  indices,
  privateDatabasePolicy:'DATABASE_UNDER_INSTALLED_PRIVATE_STATE',
  requiresRestart:true,
  doesNotExpandFileToolRoots:true,
  noAutomaticCredentialChanges:true
 };
 return {...profile,approvalSha256:createHash('sha256').update(stable(profile)).digest('hex')};
}
export function profileToBrokerSettings(installation,profile){
 if(!profile||profile.schema!=='desksom.index-feature-profile/v1')invalid('INDEX_PROFILE_SCHEMA_INVALID');
 const {approvalSha256,...body}=profile;
 if(createHash('sha256').update(stable(body)).digest('hex')!==approvalSha256)invalid('INDEX_PROFILE_HASH_MISMATCH');
 const check=makeIndexFeatureProfile(installation,{enabled:profile.enabled,roots:profile.indices.map(x=>x.root),periodicMinutes:profile.periodicReconcileMs/60000});
 if(stable(check)!==stable(profile))invalid('INDEX_PROFILE_STALE_OR_CHANGED');
 return {enabled:profile.enabled,selfHealing:profile.enabled,
  periodicReconcileMs:profile.periodicReconcileMs,indices:profile.indices.map(x=>({...x}))};
}
