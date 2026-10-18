import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const wizard=()=>fs.readFile(new URL('../../Start-DeskSom-GUI.ps1',import.meta.url),'utf8');

test('one page per setup step, shared Back/Next navigation and fixed footer',async()=>{
 const s=await wizard();
 for(const word of ['$startPage=$pages[0]','$summaryPage=$pages[1]','$connectPage=$pages[2]',
  'function Show-Page','Step 1 of 3',"$btnBack.Add_Click","$btnNext.Add_Click","Show-Page 3"]){
  assert.ok(s.includes(word),word);
 }
 assert.match(s,/pageCount=\$pages\.Count/);
 assert.match(s,/offscreenPageControls=\$badChildren/);
 assert.match(s,/ClientSize=\[Drawing\.Size\]::new\(650,400\)/);
 assert.doesNotMatch(s,/Step 2 of 3: Install/);
 assert.doesNotMatch(s,/Step 3 of 3: Connect/);
});
test('wizard preserves permissions, source check, consent and explicitly approved install',async()=>{
 const s=await wizard();
 for(const word of ['Check-Release','Get-FileHash','Check-Prerequisites','--approve','--accept-shell-access',
  'Install DeskSom with this access?','terminal commands','Start-Process','--json']){
  assert.ok(s.includes(word),word);
 }
 assert.match(s,/if\(\$script:running\)/);
 assert.match(s,/script:plan/);
 assert.match(s,/if\(\$LayoutCheck\)/);
});
test('account configuration is optional and does not collect secrets in the wizard',async()=>{
 const s=await wizard();
 assert.match(s,/scripts\\Configure-Tunnel\.ps1/);
 assert.match(s,/\$btnClose.Text=if\(\$number -eq 3\)\{'Finish'\}/);
 assert.doesNotMatch(s,/Finish for now/);
 assert.match(s,/scripts\\ControlPanel\.ps1/);
 assert.doesNotMatch(s,/--api-key|--secret-key|Write-Host \$key/);
});

test('visual preview explores all pages without installing software or configuring OpenAI',async()=>{
 const s=await wizard();
 assert.match(s,/\[switch\]\$PreviewOnly/);
 assert.match(s,/\$PreviewOnly\)\{.*Show-Page 3/);
 assert.match(s,/Visual preview only/);
 assert.match(s,/if\(\$PreviewOnly\)\{/);
 assert.match(s,/if\(\$LayoutCheck\)/);
});

test('first real launch initializes StrictMode summary before Read-Prerequisites runs',async()=>{
 const s=await wizard();
 assert.match(s,/\$script:reviewSummary=''/);
 assert.match(s,/if\(\$StartupCheck\)/);
 assert.match(s,/Check-Release\s+Load-ExistingPlan/);
 assert.match(s,/initialSummaryInitialized=/);
 assert.match(s,/noInstallerStarted=/);
});
