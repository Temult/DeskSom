#requires -Version 5.1
[CmdletBinding()]
param([ValidatePattern('^[a-z][a-z0-9-]{0,23}$')][string]$Instance='default',[ValidateRange(1024,65535)][int]$Port=18789)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'scripts\WinForms-Dpi.ps1')
$script:uiScale=Enable-DeskSomHighDpi
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$root=$PSScriptRoot
$onboarding=Join-Path $env:LOCALAPPDATA 'DeskSom-Onboarding'
$planFile=Join-Path $onboarding ($Instance+'-plan.json')
$script:node=$null;$script:pwsh=$null;$script:ready=$false
$script:installed=$false;$script:plan=$null;$script:running=$null
$script:stdout=$null;$script:stderr=$null

function Find-Exe([string]$name,[string[]]$known) {
 foreach($p in $known){if($p -and (Test-Path -LiteralPath $p -PathType Leaf)){return $p}}
 $v=Get-Command $name -ErrorAction SilentlyContinue
 if($v){return $v.Source};return $null
}
function Check-Prerequisites {
 $script:node=Find-Exe 'node.exe' @((Join-Path $env:ProgramFiles 'nodejs\node.exe'))
 $script:pwsh=Find-Exe 'pwsh.exe' @((Join-Path $env:ProgramFiles 'PowerShell\7\pwsh.exe'),(Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\pwsh.exe'))
 $script:nodeOK=$false;$script:pwshOK=$false
 if($script:node){try{$v=& $script:node --version;$script:nodeOK=([int]$v.TrimStart('v').Split('.')[0] -ge 22)}catch{}}
 if($script:pwsh){try{$v=& $script:pwsh -NoProfile -NonInteractive -Command '$PSVersionTable.PSVersion.ToString()';$script:pwshOK=([version]($v -join '') -ge [version]'7.4')}catch{}}
 return ($script:nodeOK -and $script:pwshOK)
}
function Check-Release {
 $p=Join-Path $root 'release-manifest.json'
 if(-not(Test-Path -LiteralPath $p -PathType Leaf)){throw 'This release is incomplete. Extract the prepared ZIP first.'}
 $manifest=Get-Content -LiteralPath $p -Raw -Encoding UTF8|ConvertFrom-Json
 foreach($f in $manifest.files){
  if($f.path -match '(^/|\\|(^|/)\.\.(/|$)|:)'){throw 'Unsafe path in source manifest.'}
  $fp=Join-Path $root $f.path
  if(-not(Test-Path -LiteralPath $fp -PathType Leaf)){throw 'A release file is missing. Obtain a fresh ZIP.'}
  if((Get-FileHash -LiteralPath $fp -Algorithm SHA256).Hash.ToLowerInvariant() -cne $f.sha256){
   throw 'Source files differ from the reviewed release. Download a fresh copy.'
  }
 }
}
function Invoke-DeskSom([string[]]$argsList) {
 $raw=& $script:node (Join-Path $root 'scripts\cli.mjs') @argsList --json
 $rc=$LASTEXITCODE
 try{$result=($raw -join [Environment]::NewLine)|ConvertFrom-Json}catch{throw 'DeskSom did not return a valid result.'}
 if($rc -ne 0 -or $result.operationOk -ne $true){
  if($result.error){throw ($result.error.message+' '+$result.error.nextAction)}
  throw 'DeskSom reported an unsuccessful operation. Inspect its saved receipts.'
 }
 return $result
}
function Report([string]$message,[bool]$warning=$false){
 $ico=if($warning){[Windows.Forms.MessageBoxIcon]::Warning}else{[Windows.Forms.MessageBoxIcon]::Information}
 [void][Windows.Forms.MessageBox]::Show($form,$message,'DeskSom Setup',[Windows.Forms.MessageBoxButtons]::OK,$ico)
}

$form=New-Object Windows.Forms.Form
$form.AutoScaleMode='None'
$form.Text='DeskSom Setup'
$form.Size=[Drawing.Size]::new(700,505)
$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false
$form.StartPosition='CenterScreen';$form.BackColor=[Drawing.Color]::White
$form.Font=New-Object Drawing.Font('Segoe UI',10)
function New-Label([string]$content,[int]$y,[int]$height=32){
 $l=New-Object Windows.Forms.Label
 $l.Text=$content;$l.Location=[Drawing.Point]::new(23,$y)
 $l.Size=[Drawing.Size]::new(635,$height);$form.Controls.Add($l);return $l
}
function New-Button([string]$content,[int]$x,[int]$y,[int]$width=160){
 $b=New-Object Windows.Forms.Button
 $b.Text=$content;$b.Location=[Drawing.Point]::new($x,$y)
 $b.Size=[Drawing.Size]::new($width,36);$form.Controls.Add($b);return $b
}
$heading=New-Label 'DeskSom: connect ChatGPT to this PC' 18 45
$heading.Font=New-Object Drawing.Font('Segoe UI',15,[Drawing.FontStyle]::Bold)
[void](New-Label 'Step 1 of 3: Choose a folder ChatGPT can access' 84)
[void](New-Label 'You can add or remove folders later.' 111 27)
$folder=New-Object Windows.Forms.TextBox
$folder.Location=[Drawing.Point]::new(23,143);$folder.Size=[Drawing.Size]::new(495,28)
$form.Controls.Add($folder)
$browse=New-Button 'Browse...' 530 140 130
[void](New-Label 'Step 2 of 3: Install DeskSom on this computer' 189)
$install=New-Button 'Install DeskSom' 23 225 185
$prereq=New-Button 'Install prerequisites' 218 225 190
$prereq.Visible=$false
$bar=New-Object Windows.Forms.ProgressBar
$bar.Location=[Drawing.Point]::new(23,279);$bar.Size=[Drawing.Size]::new(637,15)
$form.Controls.Add($bar)
$status=New-Label 'Checking this release and your Windows computer...' 308 53
[void](New-Label 'Step 3 of 3: Connect ChatGPT when you are ready' 369)
$connect=New-Button 'Connect ChatGPT' 23 407 180
$panel=New-Button 'Open control panel' 218 407 175
$skip=New-Button 'Finish for now' 408 407 180
$install.Enabled=$false;$browse.Enabled=$false
$connect.Enabled=$false;$panel.Enabled=$false
$timer=New-Object Windows.Forms.Timer
$timer.Interval=750
function Refresh-Setup {
 if(-not(Check-Prerequisites)){
  $install.Enabled=$false;$prereq.Visible=$true
  $missing=@()
  if(-not $script:nodeOK){$missing+='Node.js 22+'}
  if(-not $script:pwshOK){$missing+='PowerShell 7.4+'}
  $status.Text='Missing: '+($missing -join ', ')+'. Install prerequisites, then return to setup.'
  return
 }
 $prereq.Visible=$false;$install.Enabled=$true;$browse.Enabled=$true
 if(Test-Path -LiteralPath $planFile){
  $script:plan=Get-Content -LiteralPath $planFile -Raw -Encoding UTF8|ConvertFrom-Json
  if($script:plan.instance -cne $Instance -or $script:plan.port -ne $Port){throw 'A saved plan belongs to another instance or port.'}
  $folder.Text=$script:plan.allowedDirectories[0]
  $folder.ReadOnly=$true;$browse.Enabled=$false
  $browse.Text='Change folder...'
  $state=Join-Path $script:plan.stateRoot 'install.json'
  if(Test-Path -LiteralPath $state){
   $saved=Get-Content -LiteralPath $state -Raw -Encoding UTF8|ConvertFrom-Json
   if($saved.phase -in @('LOCAL_READY','TUNNEL_READY','STOPPED')){
    $script:installed=$true;$connect.Enabled=$true;$panel.Enabled=$true
    $install.Text='Check / resume setup'
    $status.Text='DeskSom is already installed. Open the control panel or finish connecting ChatGPT.'
    return
   }
  }
  if(-not(Test-Path -LiteralPath $state)){$browse.Enabled=$true}
  $status.Text='Saved setup plan found. You can change its folder before installation or safely resume it.'
 }else{
  $status.Text='Choose an existing folder, then install. You can add or remove folders later.'
 }
}

$browse.Add_Click({
 try{
  $dialog=New-Object Windows.Forms.FolderBrowserDialog
  $dialog.Description='Choose a folder that DeskSom file tools may access'
  $dialog.ShowNewFolderButton=$false
  if($dialog.ShowDialog($form) -eq 'OK'){
   $picked=$dialog.SelectedPath
   if($script:plan){
    $state=Join-Path $script:plan.stateRoot 'install.json'
    if(Test-Path -LiteralPath $state){throw 'An installation already exists. Manage folders from the DeskSom control panel.'}
    if($script:plan.sourceRoot -ine $root){throw 'The saved plan came from a different release. It cannot be reset here.'}
    foreach($name in @($script:plan.tasks.local,$script:plan.tasks.tunnel)){
     if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){throw 'An existing service task needs inspection. The saved plan was kept.'}
    }
    foreach($location in @($script:plan.installRoot,$script:plan.stateRoot)){
     if((Test-Path -LiteralPath $location) -and @(Get-ChildItem -LiteralPath $location -Force).Count){
      throw 'An installation directory already contains data. The saved plan was kept.'
     }
    }
    $message='You have not installed this instance yet. Discard its unused setup plan and choose the new folder? No project files will be removed.'
    if([Windows.Forms.MessageBox]::Show($form,$message,'Change setup folder','YesNo','Question') -ne 'Yes'){return}
    Remove-Item -LiteralPath $planFile -Force -ErrorAction Stop
    $script:plan=$null
   }
   $folder.ReadOnly=$false;$folder.Text=$picked
  }
  $dialog.Dispose()
 }catch{Report $_.Exception.Message $true}
})
$prereq.Add_Click({
 try{
  if(Check-Prerequisites){Refresh-Setup;return}
  $winget=Get-Command winget.exe -ErrorAction SilentlyContinue
  if(-not $winget){throw 'Windows Package Manager is unavailable. Follow docs/PREREQUISITES.md.'}
  $missing=@()
  if(-not $script:pwshOK){$missing+='Microsoft.PowerShell'}
  if(-not $script:nodeOK){$missing+='OpenJS.NodeJS.LTS'}
  $message='Install the following official Windows programs?' + [Environment]::NewLine + ($missing -join ', ')+
   [Environment]::NewLine + 'Windows may ask you to approve the installation.'
  if([Windows.Forms.MessageBox]::Show($form,$message,'DeskSom prerequisites','YesNo','Question') -ne 'Yes'){return}
  $runner=Join-Path $root 'scripts\Install-Prerequisites.ps1'
  Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-NoExit','-File',('"'+$runner+'"'))|Out-Null
  $status.Text='Install prerequisites in the separate window. When finished, close and reopen DeskSom Setup.'
 }catch{Report $_.Exception.Message $true}
})
$install.Add_Click({
 try{
  if($script:running){return}
  if(-not(Check-Prerequisites)){throw 'Required components are not available. Install prerequisites first.'}
  [void][IO.Directory]::CreateDirectory($onboarding)
  if(-not $script:plan){
   $picked=$folder.Text.Trim().Trim('"')
   if(-not(Test-Path -LiteralPath $picked -PathType Container)){throw 'Select an existing folder first.'}
   $req=Join-Path $onboarding ($Instance+'-request-'+[Guid]::NewGuid().ToString('N')+'.json')
   @{instance=$Instance;allowedDirectories=@([IO.Path]::GetFullPath($picked));port=$Port}|
    ConvertTo-Json -Depth 5|Set-Content -LiteralPath $req -Encoding UTF8
   $planned=Invoke-DeskSom @('plan','--spec',$req,'--out',$planFile)
   $script:plan=$planned.plan
  }
  $p=$script:plan
  $message='DeskSom can execute terminal commands using your full Windows-user permissions.'+
   [Environment]::NewLine+[Environment]::NewLine+
   'Work folder: '+($p.allowedDirectories -join '; ')+[Environment]::NewLine+
   'Private state: '+$p.stateRoot+[Environment]::NewLine+
   'Local port: '+$p.port+[Environment]::NewLine+[Environment]::NewLine+
   'File-tool folders do NOT limit terminal commands. The connection must remain private.'+
   [Environment]::NewLine+[Environment]::NewLine+'Install and authorize this Windows-user access?'
  if([Windows.Forms.MessageBox]::Show($form,$message,'Approve DeskSom permissions','YesNo','Warning') -ne 'Yes'){return}
  $nonce=[Guid]::NewGuid().ToString('N')
  $script:stdout=Join-Path $onboarding ($Instance+'-install-'+$nonce+'.json')
  $script:stderr=Join-Path $onboarding ($Instance+'-install-'+$nonce+'.stderr')
  $exe=Join-Path $root 'scripts\cli.mjs'
  $arguments=@(('"'+$exe+'"'),'install','--plan',('"'+$planFile+'"'),'--approve',$p.planSha256,'--accept-shell-access','--json')
  $script:running=Start-Process -FilePath $script:node -ArgumentList $arguments -PassThru -WindowStyle Hidden -RedirectStandardOutput $script:stdout -RedirectStandardError $script:stderr
  $install.Enabled=$false;$browse.Enabled=$false;$connect.Enabled=$false
  $status.Text='Installing and running local tests. This can take several minutes. Your computer stays usable.'
  $bar.Style='Marquee';$timer.Start()
 }catch{Report $_.Exception.Message $true}
})

$timer.Add_Tick({
 try{
  if(-not $script:running){$timer.Stop();return}
  $script:running.Refresh()
  if(-not $script:running.HasExited){return}
  $timer.Stop();$bar.Style='Blocks'
  $code=$script:running.ExitCode;$script:running.Dispose();$script:running=$null
  $result=$null
  try{$result=Get-Content -LiteralPath $script:stdout -Raw -Encoding UTF8|ConvertFrom-Json}catch{}
  if($code -ne 0 -or -not $result -or $result.operationOk -ne $true){
   $status.Text='Setup needs attention. The saved plan and receipts are preserved.'
   $install.Enabled=$true
   $detail=if($result.error){$result.error.message+' '+$result.error.nextAction}else{'The installer did not report completion.'}
   Report $detail $true;return
  }
  $script:installed=$true
  $install.Enabled=$true;$connect.Enabled=$true;$panel.Enabled=$true
  $install.Text='Check / resume setup'
  $status.Text='Installed and locally verified. DeskSom will start when you sign in.'
  try{[void](Invoke-DeskSom @('tray','--action','launch','--state',$script:plan.stateRoot))}catch{}
  Report 'DeskSom is ready on this computer. You may connect ChatGPT now or finish later.'
 }catch{$timer.Stop();$bar.Style='Blocks';Report $_.Exception.Message $true}
})
$connect.Add_Click({
 try{
  if(-not $script:installed){throw 'Install DeskSom first.'}
  $config=Join-Path $root 'scripts\Configure-Tunnel.ps1'
  $args=@('-NoProfile','-STA','-File',('"'+$config+'"'),'-StateRoot',('"'+$script:plan.stateRoot+'"'),'-Graphical','-OpenSettings')
  Start-Process -FilePath $script:pwsh -ArgumentList $args|Out-Null
  $status.Text='The private connection assistant is open. You can skip it and return later.'
 }catch{Report $_.Exception.Message $true}
})
$panel.Add_Click({
 try{
  if(-not $script:installed){throw 'Install DeskSom first.'}
  $path=Join-Path $root 'scripts\ControlPanel.ps1'
  $state=Join-Path $script:plan.stateRoot 'install.json'
  $args=@('-NoProfile','-STA','-File',('"'+$path+'"'),'-StateFile',('"'+$state+'"'))
  Start-Process -FilePath 'powershell.exe' -ArgumentList $args|Out-Null
 }catch{Report $_.Exception.Message $true}
})
$skip.Add_Click({$form.Close()})
$form.Add_Shown({
 try{Check-Release;Refresh-Setup}catch{$install.Enabled=$false;$status.Text='Installer source needs attention.';Report $_.Exception.Message $true}
})
$form.Add_FormClosing({
 if($script:running){
  $message='Setup is still running. Closing this window does not stop or undo its work. Close anyway?'
  if([Windows.Forms.MessageBox]::Show($form,$message,'DeskSom setup running','YesNo','Warning') -ne 'Yes'){$_.Cancel=$true}
 }
})
if($script:uiScale -ne 1.0){$form.Scale([Drawing.SizeF]::new($script:uiScale,$script:uiScale))}
[void]$form.ShowDialog()
$timer.Stop();$timer.Dispose();$form.Dispose()
