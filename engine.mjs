// Bootstrap the pinned stock tool engine without the hosted remote agent,
// remote feature-flag refresh, onboarding, or automatic Chrome download.
// The installer applies one declared configuration-path overlay to this
// private dependency installation. No original Desktop Commander files change.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { verifyPdfFontOverlay } from './pdf-font-overlay.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const dc = path.join(root, 'node_modules', '@wonderwhy-er', 'desktop-commander');
const load = p => import(pathToFileURL(path.join(dc, 'dist', p)).href);
if (!process.env.DESKSOM_STATE_DIR) throw new Error('DESKSOM_STATE_DIR is required');
const overlay = JSON.parse(await fs.readFile(path.join(root, 'engine-overlay.json'), 'utf8'));
const configBytes = await fs.readFile(path.join(dc, 'dist', 'config.js'));
if (createHash('sha256').update(configBytes).digest('hex') !== overlay.patched_sha256) throw new Error('Engine configuration overlay integrity mismatch');
await verifyPdfFontOverlay(root,overlay);
process.env.DESKTOP_COMMANDER_DISABLE_TELEMETRY = '1';
global.disableOnboarding = true;
await load('bootstrap.js');
const { configManager } = await load('config-manager.js');
await configManager.loadConfig();
const { FilteredStdioServerTransport } = await load('custom-stdio.js');
const { server, flushDeferredMessages } = await load('server.js');
const { preloadFileSupport } = await load('utils/files/index.js');
const transport = new FilteredStdioServerTransport();
global.mcpTransport = transport;
server.oninitialized = () => {
  transport.enableNotifications(); flushDeferredMessages();
  // Upstream 0.3.0 defers Office/PDF packages. Its normal CLI calls this hook;
  // our private bootstrap must too. Do not replay tool calls while loading.
  preloadFileSupport();
};
await server.connect(transport);
process.stdin.on('end', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
