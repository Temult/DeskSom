import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { modernExchange } from './modern.mjs';
import { prepareCatalog, catalogCapabilities } from './catalog.mjs';
import { MAX_BODY, MAX_RESULT, DISABLED, tokenMatches, validLocalRequest, childEnvironment, boundedArguments, safeError } from './security.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
function arg(name, fallback) { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; }
const configPath = arg('--config', path.join(root, 'settings.json'));
const cfg = JSON.parse(await fs.readFile(configPath, 'utf8'));
if (cfg.expectedHost.toLowerCase() !== os.hostname().toLowerCase()) throw new Error('Explicit host binding mismatch; refusing fallback');
if (!path.isAbsolute(cfg.stateDir) || !path.isAbsolute(cfg.workDir)) throw new Error('Absolute state and work directories required');
const mode = process.argv.includes('--stdio') ? 'stdio' : 'http';
const bootId = randomUUID();
const started = new Date().toISOString();
const privateState = cfg.stateDir;
await fs.mkdir(path.join(privateState, 'dc'), { recursive: true });
await fs.mkdir(path.join(privateState, 'logs'), { recursive: true });
const httpToken = process.env.DESKSOM_HTTP_TOKEN;
if (mode === 'http' && (!httpToken || httpToken.length < 32)) throw new Error('A strong local HTTP bearer token is required');
const env = childEnvironment(process.env);
env.DESKSOM_STATE_DIR = path.join(privateState, 'dc');
const child = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'engine.mjs')], cwd: cfg.workDir, env, stderr: 'pipe' });
const client = new Client({ name: 'somnerai-desksom-broker', version: '0.2.0-rc.11' }, { capabilities: {} });
let ready = false, closing = false, completed = 0, active = 0;
// In-memory per-boot counters only. No command arguments, file paths or contents.
const metrics={attempted:0,succeeded:0,rejected:0,uncertain:0,elapsedMs:0,lastCompletedAt:null};
const perTool=new Map();
let auditChain = Promise.resolve();
const auditPath = path.join(privateState, 'logs', `audit-${bootId}.jsonl`);
function audit(record) {
  // Never persist tool arguments, results, bearer tokens, or runtime credentials.
  auditChain = auditChain.then(() => fs.appendFile(auditPath, JSON.stringify({ at: new Date().toISOString(), bootId, ...record }) + '\n'));
  auditChain.catch(() => { process.stderr.write('DeskSom audit write failed\n'); });
}
client.onerror = e => { process.stderr.write(`DeskSom upstream: ${safeError(e)}\n`); };
await client.connect(child);
if (child.stderr) child.stderr.on('data', b => process.stderr.write(safeError(b.toString()) + '\n'));
const catalog = prepareCatalog((await client.listTools()).tools, DISABLED);
const advertisedCapabilities = catalogCapabilities([{name:'desksom_status'}, ...catalog]);
if (catalog.some(t => JSON.stringify(t).includes('ui://desktop-commander/'))) {
  throw new Error('Unserved upstream UI resource leaked into tool catalog');
}
const names = new Set(catalog.map(t => t.name));
const catalogHash = createHash('sha256').update(JSON.stringify(catalog)).digest('hex');
ready = true;
client.onclose = () => {
  ready = false;
  if (!closing) { audit({ event: 'upstream_lost', replay: false }); process.stderr.write('DeskSom engine disconnected. No tool call will be replayed.\n'); }
};
function status() {
  return { name: 'DeskSom', version: '0.2.0-rc.11', instance: cfg.instance ?? null, installationId: cfg.installationId ?? null, sourceFingerprint: cfg.sourceFingerprint ?? null, host: os.hostname(), bootId, started, ready, mode,
    upstreamVersion: '0.2.52', enginePid: child.pid ?? null, tools: catalog.length, catalogSha256: catalogHash,
    advertisedToolCount: advertisedCapabilities.toolCount, advertisedCapabilities,
    activeCalls: active, completedCalls: completed, allowedFileRoots: cfg.allowedDirectories,
    rootsRevision:cfg.rootsRevision??0,
    statistics:{scope:'CURRENT_BROKER_BOOT',uptimeSeconds:Math.max(0,Math.floor((Date.now()-Date.parse(started))/1000)),
      attempted:metrics.attempted,succeeded:metrics.succeeded,rejected:metrics.rejected,uncertain:metrics.uncertain,
      active:active,avgElapsedMs:metrics.succeeded+metrics.rejected+metrics.uncertain?Math.round(metrics.elapsedMs/(metrics.succeeded+metrics.rejected+metrics.uncertain)):0,
      lastCompletedAt:metrics.lastCompletedAt,
      tools:[...perTool.entries()].map(([name,counts])=>({name,...counts})).sort((a,b)=>b.completed-a.completed).slice(0,12)},
    authority: 'trusted-local operator; file roots do not sandbox terminal commands',
    hostedDesktopCommanderRelay: false, modelApiCalls: false, automaticWriteReplay: false };
}
const identityTool = { name: 'desksom_status', description: 'Read DeskSom host identity, engine generation, health, and boundaries. Verify the intended host before actions. Does not authorize project gates.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } };
async function dispatchTool(params) {
    const name = params.name;
    if (name === 'desksom_status') return { content: [{ type: 'text', text: JSON.stringify(status()) }], structuredContent: status() };
    if (!names.has(name)) return { isError: true, content: [{ type: 'text', text: `TOOL_NOT_EXPOSED: ${name}` }] };
    if (!ready) return { isError: true, content: [{ type: 'text', text: 'ENGINE_UNAVAILABLE: no retry or replay performed. Check status and reconcile side effects before resubmitting.' }] };
    if (active >= 12) return { isError: true, content: [{ type: 'text', text: 'BUSY_NOT_STARTED: concurrency limit reached; no tool was invoked.' }] };
    const id = randomUUID(), begin = Date.now();
    let args;
    try { args = boundedArguments(name, params.arguments); }
    catch (e) { return { isError: true, content: [{ type: 'text', text: safeError(e) }] }; }
    active++;metrics.attempted++;
    const counter=perTool.get(name)??{completed:0,failed:0};perTool.set(name,counter);
    audit({ event: 'call_started', id, tool: name, argumentsSha256: createHash('sha256').update(JSON.stringify(args)).digest('hex') });
    try {
      const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 });
      completed++;counter.completed++;metrics.elapsedMs+=Date.now()-begin;metrics.lastCompletedAt=new Date().toISOString();
      if(result.isError===true){metrics.rejected++;counter.failed++;}else{metrics.succeeded++;}
      audit({ event: 'call_finished', id, tool: name, elapsedMs: Date.now() - begin, isError: result.isError === true });
      if (Buffer.byteLength(JSON.stringify(result)) > MAX_RESULT) return { isError: true, content: [{ type: 'text', text: 'RESULT_TOO_LARGE: the tool did execute. Use smaller read/output ranges; do not blindly repeat writes.' }] };
      return result;
    } catch (e) {
      metrics.uncertain++;counter.failed++;metrics.elapsedMs+=Date.now()-begin;metrics.lastCompletedAt=new Date().toISOString();
      audit({ event: 'call_uncertain', id, tool: name, elapsedMs: Date.now() - begin });
      return { isError: true, content: [{ type: 'text', text: `CALL_OUTCOME_UNCERTAIN: ${safeError(e)}. No replay performed. Inspect side effects before retrying.` }] };
    } finally { active--; }
}

function makeServer() {
  const server = new Server({ name: 'somnerai-desksom', version: '0.2.0-rc.11' }, { capabilities: { tools: {} },
    instructions: 'DeskSom runs on the explicitly named Windows host. Preserve project authority boundaries. A terminal has the Windows account permissions, not a sandbox. Never reuse a consumed grant or infer production authorization. No automatic retries of writes after ambiguous errors. Check desksom_status after reconnect. Its advertisedToolCount and advertisedCapabilities describe the SERVER catalog, not the tool subset visible or permitted in this ChatGPT conversation. If a tool is unavailable here, report client tool exposure/permission separately from Windows authorization; never bypass a genuine denial.' });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [identityTool, ...catalog] }));
  server.setRequestHandler(CallToolRequestSchema, async request => dispatchTool(request.params));
  return server;
}
let listener;
async function shutdown() {
  if (closing) return;
  closing = true; ready = false;
  listener?.close();
  await client.close().catch(() => {});
  await auditChain.catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
if (mode === 'stdio') {
  await makeServer().connect(new StdioServerTransport());
  process.stdin.on('end', shutdown);
} else {
  const send = (res, code, obj) => { if (!res.headersSent) res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(obj)); };
  listener = http.createServer(async (req, res) => {
    const port = listener.address().port;
    if (!validLocalRequest(req.headers.host, req.headers.origin, port)) return send(res, 403, { error: 'host_or_origin_rejected' });
    if (req.url === '/healthz' && req.method === 'GET') return send(res, 200, { service: 'DeskSom', bootId });
    if (req.url === '/readyz' && req.method === 'GET') return send(res, ready ? 200 : 503, { ready, bootId });
    if (req.url !== '/mcp') return send(res, 404, { error: 'not_found' });
    if (!tokenMatches(req.headers.authorization, httpToken)) { res.setHeader('WWW-Authenticate', 'Bearer realm="DeskSom-local"'); return send(res, 401, { error: 'unauthorized' }); }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'stateless_post_only' }); }
    if (Number(req.headers['content-length'] ?? 0) > MAX_BODY) { req.resume(); return send(res, 413, { error: 'request_too_large' }); }
    let bytes = 0, chunks = [];
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > MAX_BODY) return send(res, 413, { error: 'request_too_large' });
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return send(res, 400, { error: 'invalid_json' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { error: 'single_jsonrpc_object_required' });
      const modern = await modernExchange(req.headers, body, { tools: [identityTool, ...catalog], invokeTool: dispatchTool });
      if (modern) return send(res, modern.status, modern.body);
      const server = makeServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await server.connect(transport);
      // HTTP clients may reconnect freely; all transports share one live engine.
      res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
      await transport.handleRequest(req, res, body);
    } catch (e) {
      process.stderr.write(`DeskSom HTTP: ${safeError(e)}\n`);
      if (!res.writableEnded) send(res, 500, { error: 'request_failed_no_automatic_replay' });
    }
  });
  listener.requestTimeout = 130000;
  listener.headersTimeout = 10000;
  listener.maxHeadersCount = 48;
  const port = Number(arg('--port', cfg.port ?? 18789));
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(port, '127.0.0.1', resolve); });
  const address = `http://127.0.0.1:${listener.address().port}`;
  const startup = { event: 'ready', address, bootId, pid: process.pid, enginePid: child.pid ?? null, catalogSha256: catalogHash };
  const statusFile = arg('--status-file', path.join(privateState, 'service-status.json'));
  await fs.writeFile(statusFile, JSON.stringify(startup, null, 2));
  process.stdout.write(JSON.stringify(startup) + '\n');
}
