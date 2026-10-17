// DeskSom 0.1.1: explicit MCP 2026-07-28 compatibility. No request replay.
export const MODERN_PROTOCOL = '2026-07-28';
export const META_VERSION = 'io.modelcontextprotocol/protocolVersion';
export const META_CLIENT = 'io.modelcontextprotocol/clientInfo';
export const META_CAPS = 'io.modelcontextprotocol/clientCapabilities';
const SERVER_NAME = 'somnerai-desksom';
const SERVER_VERSION = '0.2.0-rc.2';
const SERVER_INSTRUCTIONS = 'DeskSom is an explicitly identified trusted-local Windows operator, not a sandbox. Preserve project authorization gates, never replay ambiguous writes, and inspect exact host identity before actions.';

function object(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function error(id, code, message, status = 200) {
  return { status, body: { jsonrpc: '2.0', id: id ?? null, error: { code, message } } };
}
function result(id, value) { return { status: 200, body: { jsonrpc: '2.0', id, result: value } }; }

export async function modernExchange(headers, body, { tools, invokeTool }) {
  const headerVersion = headers['mcp-protocol-version'];
  const meta = object(body?.params) && object(body.params._meta) ? body.params._meta : null;
  const bodyVersion = meta?.[META_VERSION];
  if (headerVersion !== MODERN_PROTOCOL && bodyVersion !== MODERN_PROTOCOL) return null;
  const id = body?.id;
  if (headerVersion !== MODERN_PROTOCOL || bodyVersion !== MODERN_PROTOCOL ||
      !object(meta?.[META_CLIENT]) || typeof meta[META_CLIENT].name !== 'string' ||
      !object(meta?.[META_CAPS])) {
    return error(id, -32600, 'MCP modern protocol version or self-contained client context mismatch', 400);
  }
  if (body?.jsonrpc !== '2.0' || typeof body?.method !== 'string' ||
      !(['string', 'number'].includes(typeof id)) || (typeof id === 'number' && !Number.isFinite(id))) {
    return error(id, -32600, 'Invalid JSON-RPC request', 400);
  }
  if (headers['mcp-session-id']) return error(id, -32600, 'Modern requests must not carry session identifiers', 400);
  if (headers['mcp-method'] && headers['mcp-method'] !== body.method) {
    return error(id, -32600, 'MCP method header mismatch', 400);
  }
  if (body.method === 'server/discover') {
    return result(id, {
      resultType: 'complete',
      supportedVersions: [MODERN_PROTOCOL],
      ttlMs: 0, cacheScope: 'private',
      capabilities: { tools: {} },
      instructions: SERVER_INSTRUCTIONS,
      _meta: { 'io.modelcontextprotocol/serverInfo': { name: SERVER_NAME, version: SERVER_VERSION } }
    });
  }
  if (body.method === 'tools/list') {
    if (body.params.cursor !== undefined) return error(id, -32602, 'DeskSom catalog does not accept continuation cursors');
    return result(id, { resultType: 'complete', ttlMs: 0, cacheScope: 'private', tools });
  }
  if (body.method === 'tools/call') {
    const { name, arguments: args } = body.params;
    if (typeof name !== 'string' || name.length < 1 || !object(args ?? {})) {
      return error(id, -32602, 'Tool name or arguments are invalid');
    }
    if (headers['mcp-name'] && headers['mcp-name'] !== name) return error(id, -32600, 'MCP name header mismatch', 400);
    // The original audited operation custody, caps, and no-retry semantics are reused.
    const response = await invokeTool({ name, arguments: args ?? {} });
    if (!object(response)) return error(id, -32603, 'Invalid tool result');
    return result(id, { ...response, resultType: 'complete' });
  }
  return error(id, -32601, 'Method not found');
}
