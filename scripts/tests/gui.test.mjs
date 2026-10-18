import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const get=async name=>readFile(new URL('../../'+name,import.meta.url),'utf8');

test('double-click entry point starts graphical setup and keeps CLI fallback',async()=>{
 const gui=await get('Start-DeskSom.cmd');
 const fallback=await get('Start-DeskSom-CLI.cmd');
 assert.match(gui,/Start-DeskSom-GUI\.ps1/);
 assert.match(gui,/powershell\.exe .*?-STA/);
 assert.match(fallback,/Start-DeskSom\.ps1/);
});
test('graphical install uses the established bound plan and explicit approval',async()=>{
 const wizard=await get('Start-DeskSom-GUI.ps1');
 assert.match(wizard,/Get-FileHash/);
 assert.match(wizard,/--approve/);
 assert.match(wizard,/--accept-shell-access/);
 assert.match(wizard,/full Windows-user permissions/);
 assert.match(wizard,/Private state:/);
 assert.match(wizard,/Connect ChatGPT/);
 assert.match(wizard,/--state/);
 assert.match(wizard,/Start-Process/);
 assert.doesNotMatch(wizard,/--api-key|--secret|--force-install/);
});
test('graphical account prompt preserves local masked key and install identity checks',async()=>{
 const script=await get('scripts/Configure-Tunnel.ps1');
 const dialog=await get('scripts/Connection-Prompts.ps1');
 assert.match(script,/Graphical/);
 assert.match(script,/Ds-SaveSecret/);
 assert.match(script,/Ds-Identity/);
 assert.match(script,/Ds-TunnelIdPrompt/);
 assert.match(script,/Ds-RestrictedKeyPrompt/);
 assert.match(dialog,/UseSystemPasswordChar\s*=\s*\$true/);
 assert.match(dialog,/ConvertTo-SecureString/);
 assert.doesNotMatch(dialog,/Out-File|Write-Host.*\$entry\.Text|Set-Clipboard/);
});
test('all Windows graphical surfaces opt into crisp high-DPI rendering',async()=>{
 const dpi=await get('scripts/WinForms-Dpi.ps1');
 assert.match(dpi,/SetProcessDpiAwarenessContext/);
 assert.match(dpi,/GetDpiForSystem/);
 for(const file of ['Start-DeskSom-GUI.ps1','scripts/ControlPanel.ps1','scripts/Connection-Prompts.ps1','scripts/Tray-App.ps1']){
  const source=await get(file);
  assert.match(source,/Enable-DeskSomHighDpi/);
 }
 for(const file of ['Start-DeskSom-GUI.ps1','scripts/ControlPanel.ps1','scripts/Connection-Prompts.ps1']){
  const source=await get(file);
  assert.match(source,/\.Scale\(/);
  assert.match(source,/AutoScaleMode='None'/);
 }
 const wizard=await get('Start-DeskSom-GUI.ps1');
 assert.match(wizard,/Choose a folder ChatGPT can access/);
 assert.match(wizard,/You can add or remove folders later/);
 assert.doesNotMatch(wizard,/Choose a folder for ChatGPT file tools/);
});

test('control panel tabs handle navigation without duplicate overview buttons',async()=>{
 const panel=await get('scripts/ControlPanel.ps1');
 assert.doesNotMatch(panel,/\$btnOpenFolders|\$btnOpenStats/);
 assert.match(panel,/\$btnOverview=Add-Button \$overview 'Refresh'/);
 assert.match(panel,/\$btnOverview\.Add_Click/);
 assert.match(panel,/\$tabs\.TabPages\['Folders'\]/);
 assert.match(panel,/\$tabs\.TabPages\['Statistics'\]/);
 assert.match(panel,/\$btnAdd=Add-Button/);
 assert.match(panel,/\$btnRemove=Add-Button/);
 assert.match(panel,/\$btnStop=Add-Button/);
 assert.match(panel,/\$btnStart=Add-Button/);
 assert.match(panel,/\$PreviewOnly -or \$LayoutCheck/);
 assert.match(panel,/visual preview \(sample data\)/);
 assert.match(panel,/Changes are disabled in visual preview/);
});

test('beginner ChatGPT connection guide retains owner account decisions',async()=>{
 const guide=await get('scripts/ChatGPT-Connection-Guide.ps1');
 const wizard=await get('Start-DeskSom-GUI.ps1');
 const controller=await get('scripts/Configure-Tunnel.ps1');
 const host=await get('scripts/lib/windows.mjs');
 assert.match(guide,/Add custom MCP server/);
 assert.match(guide,/No authentication/);
 assert.match(guide,/Copy tunnel ID/);
 assert.match(guide,/Copy verification message/);
 assert.match(guide,/https:\/\/chatgpt\.com\/plugins/);
 assert.match(guide,/association\.installationId -cne \$state\.installationId/);
 assert.match(guide,/association\.sourceFingerprint -cne \$state\.plan\.sourceFingerprint/);
 assert.match(guide,/\$StateCheck/);
 assert.doesNotMatch(guide,/control-plane-api-key\.dpapi|Ds-SaveSecret|Create as a plugin.*Start-Process/);
 assert.match(wizard,/ChatGPT-Connection-Guide\.ps1/);
 assert.match(controller,/ChatGPT-Connection-Guide\.ps1/);
 assert.match(host,/chatgpt-connection-guide-tests/);
});

test('prerequisites require a user action and use exact official package names',async()=>{
 const wizard=await get('Start-DeskSom-GUI.ps1');
 const prereq=await get('scripts/Install-Prerequisites.ps1');
 assert.match(wizard,/prereq\.Add_Click/);
 assert.match(wizard,/MessageBox/);
 assert.match(prereq,/Microsoft\.PowerShell/);
 assert.match(prereq,/OpenJS\.NodeJS\.LTS/);
 assert.match(prereq,/--exact --source winget/);
});
