import { createHash, timingSafeEqual } from 'node:crypto';

export const MAX_BODY = 256 * 1024;
export const MAX_RESULT = 1024 * 1024;
export const DISABLED = new Set(['set_config_value', 'give_feedback_to_desktop_commander', 'track_ui_event']);
export const PROCESS_TOOLS = new Set(['start_process', 'read_process_output', 'interact_with_process']);
export function tokenMatches(header, token) {
  if (typeof header !== 'string' || typeof token !== 'string' || token.length < 32) return false;
  const digest = x => createHash('sha256').update(x).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${token}`));
}
export function validLocalRequest(host, origin, port) {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  return hosts.includes(host) && (!origin || hosts.map(h => `http://${h}`).includes(origin));
}
export function childEnvironment(source) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (/^(CONTROL_PLANE_|TUNNEL_CLIENT_|OPENAI_ADMIN_KEY$|OPENAI_API_KEY$|DESKSOM_HTTP_TOKEN$|DESKSOM_MCP_AUTH$|CLOUDFLARED_)/i.test(key)) delete env[key];
  }
  // Worker threads use case-sensitive env lookups even on Windows. Upstream
  // 0.3.0 resolves executable paths itself; normalize PATH rather than rely
  // on Windows' implicit current-directory executable search.
  if(process.platform==='win32')for(const canonical of ['PATH','PATHEXT']){
    const keys=Object.keys(env).filter(k=>k.toUpperCase()===canonical);
    const value=keys.map(k=>env[k]).find(v=>typeof v==='string');
    for(const k of keys)delete env[k];
    if(value!==undefined)env[canonical]=value;
  }
  env.DESKTOP_COMMANDER_DISABLE_TELEMETRY = '1';
  return env;
}
export function boundedArguments(name, args = {}) {
  const copy = { ...args };
  // Upstream 0.2.52 accepts PID 0/negative/fractional values. Reject before
  // any call reaches the process engine; positive ordinary PIDs are unchanged.
  if (['kill_process','force_terminate'].includes(name) &&
      (!Number.isSafeInteger(copy.pid)||copy.pid<=0||copy.pid>0x7fffffff))
    throw new Error('INVALID_PID: a positive integer process ID is required');
  if (PROCESS_TOOLS.has(name)) {
    const supplied = copy.timeout_ms;
    if (supplied !== undefined && (!Number.isFinite(supplied) || supplied < 0)) throw new Error('timeout_ms must be a nonnegative finite number');
    copy.timeout_ms = Math.min(supplied ?? 1500, 2000);
  }
  return copy;
}
export function safeError(error) {
  return String(error?.message ?? error).replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]').replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]').slice(0, 2000);
}
