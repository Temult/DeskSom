import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export class DeskSomError extends Error {
  constructor(code, message, nextAction, exitCode = 20) {
    super(message); this.name = 'DeskSomError'; this.code = code;
    this.nextAction = nextAction || 'Inspect the reported condition before trying again.';
    this.exitCode = exitCode;
  }
}
export const fail = (code, message, nextAction, exitCode) => { throw new DeskSomError(code, message, nextAction, exitCode); };
export const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export function canonical(x) {
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  if (isObject(x)) return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
  return JSON.stringify(x);
}
export const sha = x => crypto.createHash('sha256').update(x).digest('hex');
export const hashObject = x => sha(canonical(x));
export async function hashFile(p) { return sha(await fs.readFile(p)); }
export async function exists(p) { try { await fs.lstat(p); return true; } catch(e) { if (e.code === 'ENOENT') return false; throw e; } }
export async function readJson(p) { return JSON.parse((await fs.readFile(p, 'utf8')).replace(/^\uFEFF/, '')); }
export async function atomicJson(p, value) {
  const tmp = p + '.' + crypto.randomUUID() + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  try { await fs.rename(tmp, p); } finally { await fs.rm(tmp, {force: true}).catch(() => {}); }
}
export async function createJson(p, value) {
  await fs.writeFile(p, JSON.stringify(value, null, 2) + '\n', {flag: 'wx', mode: 0o600});
}
export function keysOnly(obj, keys, label) {
  if (!isObject(obj)) fail('INVALID_INPUT', `${label} must be a JSON object.`);
  const extras = Object.keys(obj).filter(k => !keys.includes(k));
  if (extras.length) fail('INVALID_INPUT', `${label} has unsupported fields: ${extras.join(', ')}.`);
}
export function instanceName(name) {
  if (typeof name !== 'string' || !/^[a-z][a-z0-9-]{0,23}$/.test(name))
    fail('INVALID_INSTANCE', 'Use an instance name of 1-24 lowercase letters, digits or hyphens, starting with a letter.');
  return name;
}
export function normalizeWin(p) {
  if (typeof p !== 'string' || !/^[A-Za-z]:[\\/]/.test(p) || /[\x00-\x1f<>"|?*]/.test(p) || /:(?![\\/])/.test(p) || /[ .](?:[\\/]|$)/.test(p))
    fail('INVALID_PATH', 'An absolute local Windows path without namespace prefixes or special characters is required.');
  const normalized = path.win32.normalize(p);
  const n = normalized.length === 3 ? normalized : normalized.replace(/[\\/]+$/, '');
  if (/(^|\\)(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|\\|$)/i.test(n)) fail('INVALID_PATH', 'Reserved device names are not accepted.');
  return n;
}
export function insideWin(child, parent) {
  const a = normalizeWin(child).toLowerCase(), b = normalizeWin(parent).toLowerCase();
  return a === b || a.startsWith(b.endsWith('\\') ? b : b + '\\');
}
export function overlapWin(a, b) { return insideWin(a, b) || insideWin(b, a); }
export function safeRelative(s) {
  if (typeof s !== 'string' || !s || s.includes('\\') || path.posix.isAbsolute(s) || s.split('/').some(x => !x || x === '.' || x === '..') || s.includes(':'))
    fail('INVALID_MANIFEST', 'A release manifest path is not a safe relative path.');
  return s;
}
export async function assertNoLinks(p) {
  let current = path.resolve(p);
  while (true) {
    try { if ((await fs.lstat(current)).isSymbolicLink()) fail('LINKED_PATH', 'Installation paths must not pass through a symlink or junction.', 'Choose a real directory, not a linked location.'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
}
export const now = () => new Date().toISOString();
export function redactedError(e) {
  // Public diagnostics use the stable code, never raw child output or exception text.
  return e instanceof DeskSomError ? {code: e.code, message: e.message, nextAction: e.nextAction}
    : {code:'UNEXPECTED_ERROR', message:'The operation failed; no success is claimed.', nextAction:'Inspect the private local operation log. Do not post raw logs publicly.'};
}
export function envelope(command, fields = {}) {
  return {schemaVersion:'desksom.result/v1', command, at:now(), operationOk:true, setupComplete:false, ...fields};
}
export async function loadRelease(root) {
  const manifest = await readJson(path.join(root, 'release-manifest.json'));
  keysOnly(manifest, ['schemaVersion','version','files'], 'release manifest');
  if (manifest.schemaVersion !== 'desksom.release/v1' || typeof manifest.version !== 'string' || !Array.isArray(manifest.files) || !manifest.files.length)
    fail('INVALID_MANIFEST', 'The release manifest is not supported.');
  const seen = new Set();
  for (const file of manifest.files) {
    keysOnly(file, ['path','sha256','bytes'], 'release entry');
    safeRelative(file.path);
    if (seen.has(file.path.toLowerCase()) || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0)
      fail('INVALID_MANIFEST', 'Duplicate or malformed release entries were found.');
    seen.add(file.path.toLowerCase());
    const absolute = path.join(root, file.path); await assertNoLinks(absolute);
    const data = await fs.readFile(absolute);
    if (data.length !== file.bytes || sha(data) !== file.sha256)
      fail('SOURCE_DRIFT', `Release source differs from the manifest: ${file.path}.`, 'Obtain the original release again. Never regenerate hashes to conceal drift.', 21);
  }
  const needed = ['broker.mjs','modern.mjs','engine.mjs','security.mjs','setup.mjs','package.json','package-lock.json','release-policy.json','scripts/WindowsHost.ps1','scripts/Run-Service.ps1','scripts/Task-Launcher.ps1'];
  if (needed.some(p => !seen.has(p.toLowerCase()))) fail('INVALID_MANIFEST', 'Required runtime files are absent from the release.');
  return {manifest, fingerprint:hashObject(manifest)};
}
