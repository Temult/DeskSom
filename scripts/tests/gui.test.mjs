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
test('prerequisites require a user action and use exact official package names',async()=>{
 const wizard=await get('Start-DeskSom-GUI.ps1');
 const prereq=await get('scripts/Install-Prerequisites.ps1');
 assert.match(wizard,/prereq\.Add_Click/);
 assert.match(wizard,/MessageBox/);
 assert.match(prereq,/Microsoft\.PowerShell/);
 assert.match(prereq,/OpenJS\.NodeJS\.LTS/);
 assert.match(prereq,/--exact --source winget/);
});
