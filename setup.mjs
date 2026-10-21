import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { resolvePowerShell7 } from './windows-shell.mjs';
import { applyPdfFontOverlay } from './pdf-font-overlay.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const dc = path.join(root, 'node_modules', '@wonderwhy-er', 'desktop-commander');
const version = JSON.parse(await fs.readFile(path.join(dc, 'package.json'), 'utf8')).version;
if (version !== '0.3.0') throw new Error('Only qualified Desktop Commander 0.3.0 is accepted');
const target = path.join(dc, 'dist', 'config.js');
const original = "const CONFIG_DIR = path.join(USER_HOME, '.claude-server-commander');";
const replacement = "const CONFIG_DIR = process.env.DESKSOM_STATE_DIR;\nif (!CONFIG_DIR || !path.isAbsolute(CONFIG_DIR)) throw new Error('DESKSOM_STATE_DIR must be an absolute private state directory');";
const hash = b => createHash('sha256').update(b).digest('hex');
let text = await fs.readFile(target, 'utf8');
const overlayPath = path.join(root, 'engine-overlay.json');
if (text.includes(original)) {
  if (text.split(original).length !== 2) throw new Error('Ambiguous configuration overlay');
  const before = hash(text);
  text = text.replace(original, replacement);
  await fs.writeFile(target, text);
  await fs.writeFile(overlayPath, JSON.stringify({ upstream: '@wonderwhy-er/desktop-commander@0.3.0', target: 'dist/config.js', original_sha256: before, patched_sha256: hash(text), replacement, purpose: 'Isolate configuration and logs without changing USERPROFILE, HOME or shell identity' }, null, 2));
} else {
  const overlay = JSON.parse(await fs.readFile(overlayPath, 'utf8'));
  if (hash(text) !== overlay.patched_sha256) throw new Error('Unexpected dependency bytes; refusing to patch');
}
await applyPdfFontOverlay(root);
const supplied = process.argv[2];
const settingsPath = supplied ? path.resolve(supplied) : path.join(root, 'settings.json');
let cfg;
try { cfg = JSON.parse(await fs.readFile(settingsPath, 'utf8')); }
catch (e) {
  if (e.code !== 'ENOENT') throw e;
  cfg = { expectedHost: os.hostname(), port: 18789,
    stateDir: path.join(process.env.LOCALAPPDATA || os.homedir(), 'SomnerAI', 'DeskSom'),
    workDir: root, allowedDirectories: [root] };
  await fs.writeFile(settingsPath, JSON.stringify(cfg, null, 2), { flag: 'wx' });
}
if (cfg.expectedHost.toLowerCase() !== os.hostname().toLowerCase()) throw new Error('Host identity mismatch');
await fs.mkdir(path.join(cfg.stateDir, 'dc'), { recursive: true });
process.env.DESKSOM_STATE_DIR = path.join(cfg.stateDir, 'dc');
process.env.DESKTOP_COMMANDER_DISABLE_TELEMETRY = '1';
const { configManager } = await import(pathToFileURL(path.join(dc, 'dist', 'config-manager.js')).href);
const config = configManager.getDefaultConfig();
Object.assign(config, { defaultShell: process.platform==='win32'?resolvePowerShell7():'pwsh', allowedDirectories: cfg.allowedDirectories, telemetryEnabled: false,
  welcomeOnboardingEligible: false, pendingWelcomeOnboarding: false, fileReadLineLimit: 500, fileWriteLineLimit: 500 });
const stateConfig = path.join(cfg.stateDir, 'dc', 'config.json');
try { await fs.writeFile(stateConfig, JSON.stringify(config, null, 2), { flag: 'wx' }); }
catch (e) { if (e.code !== 'EEXIST') throw e; }
console.log(JSON.stringify({ result: 'SETUP_PASS', host: os.hostname(), settingsPath, stateDir: cfg.stateDir, version }));
