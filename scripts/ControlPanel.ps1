#requires -Version 5.1
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$StateFile,
  [ValidateSet('Overview','Folders','Statistics','Settings')][string]$Tab='Overview'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$state=Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8|ConvertFrom-Json
if($state.plan.binding.host -cne [Environment]::MachineName -or
   $state.plan.binding.sid -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value){
  throw 'This DeskSom installation belongs to another Windows host or account.'
}
$node=$state.environment.node
$cli=Join-Path $state.runtimeRoot 'scripts\cli.mjs'
if(-not(Test-Path -LiteralPath $cli -PathType Leaf)){throw 'DeskSom runtime is missing. Do not repair or reinstall blindly.'}
$root=$state.plan.stateRoot

function Invoke-DeskSom([string[]]$Arguments,[switch]$AllowAttention){
  $raw=& $node $cli @Arguments --json
  $code=$LASTEXITCODE
  $json=($raw -join [Environment]::NewLine)|ConvertFrom-Json
  if($code -ne 0 -and (-not $AllowAttention)){
    $msg=if($json.error){$json.error.message+'  '+$json.error.nextAction}else{'The command did not succeed.'}
    throw $msg
  }
  return $json
}
function Show-Error($exception){
  [void][Windows.Forms.MessageBox]::Show([string]$exception.Exception.Message,'DeskSom',[Windows.Forms.MessageBoxButtons]::OK,[Windows.Forms.MessageBoxIcon]::Warning)
}
$form=New-Object Windows.Forms.Form
$form.Text='DeskSom  |  '+$state.plan.instance
$form.StartPosition='CenterScreen';$form.Size=[Drawing.Size]::new(730,525)
$form.MinimumSize=[Drawing.Size]::new(650,470);$form.Font=New-Object Drawing.Font('Segoe UI',9)
$form.BackColor=[Drawing.Color]::White
$tabs=New-Object Windows.Forms.TabControl
$tabs.Dock='Fill'
foreach($name in @('Overview','Folders','Statistics','Settings')){
 $p=New-Object Windows.Forms.TabPage;$p.Text=$name;$p.Name=$name;$p.BackColor=[Drawing.Color]::White
 [void]$tabs.TabPages.Add($p)
}
$form.Controls.Add($tabs)
$tabs.SelectTab($Tab)
function Add-Button($parent,$text,[int]$x,[int]$y,[int]$w=120){
 $btn=New-Object Windows.Forms.Button
 $btn.Text=$text;$btn.Location=[Drawing.Point]::new($x,$y)
 $btn.Size=[Drawing.Size]::new($w,31)
 $parent.Controls.Add($btn)
 return $btn
}
function Add-Label($parent,$text,[int]$x,[int]$y,[int]$w=640,[int]$h=34){
 $label=New-Object Windows.Forms.Label
 $label.Text=$text;$label.Location=[Drawing.Point]::new($x,$y)
 $label.Size=[Drawing.Size]::new($w,$h)
 $parent.Controls.Add($label)
 return $label
}
$overview=$tabs.TabPages['Overview']
[void](Add-Label $overview 'Private Windows-to-ChatGPT connection' 20 22 620 38)
$info=Add-Label $overview 'Checking local service...' 20 70 650 180
$btnOverview=Add-Button $overview 'Refresh status' 20 270 130
$btnOpenFolders=Add-Button $overview 'Manage folders' 165 270 145
$btnOpenStats=Add-Button $overview 'Statistics' 325 270 120
$btnOpenFolders.Add_Click({$tabs.SelectTab('Folders')})
$btnOpenStats.Add_Click({$tabs.SelectTab('Statistics')})

$foldersPage=$tabs.TabPages['Folders']
[void](Add-Label $foldersPage 'Folders available to Desktop Commander file tools' 20 16 650 34)
$folderList=New-Object Windows.Forms.ListBox
$folderList.Location=[Drawing.Point]::new(20,52);$folderList.Size=[Drawing.Size]::new(658,252)
$folderList.Anchor='Top,Left,Right,Bottom'
$foldersPage.Controls.Add($folderList)
$folderHint=Add-Label $foldersPage 'Terminal commands retain your full Windows-account access outside these folders.' 20 316 640 42
$btnAdd=Add-Button $foldersPage 'Add folder...' 20 370 135
$btnRemove=Add-Button $foldersPage 'Remove selected...' 170 370 155
$btnRefreshFolders=Add-Button $foldersPage 'Refresh' 343 370 105
$btnRefreshFolders.Add_Click({try{Refresh-Folders}catch{Show-Error $_}})

$statsPage=$tabs.TabPages['Statistics']
[void](Add-Label $statsPage 'Lightweight counters, reset whenever the broker restarts' 20 16 640 34)
$statsText=New-Object Windows.Forms.TextBox
$statsText.Multiline=$true;$statsText.ScrollBars='Vertical';$statsText.ReadOnly=$true
$statsText.Font=New-Object Drawing.Font('Consolas',10)
$statsText.Location=[Drawing.Point]::new(20,54);$statsText.Size=[Drawing.Size]::new(658,310)
$statsText.Anchor='Top,Left,Right,Bottom'
$statsPage.Controls.Add($statsText)
$btnStats=Add-Button $statsPage 'Refresh statistics' 20 377 150

$settingsPage=$tabs.TabPages['Settings']
[void](Add-Label $settingsPage 'DeskSom starts at Windows sign-in, not before the user logs in.' 20 20 650 42)
$settingsText=Add-Label $settingsPage ('Instance: '+$state.plan.instance+[Environment]::NewLine+
  'Version: '+$state.plan.version+[Environment]::NewLine+
  'Local port: '+$state.plan.port+[Environment]::NewLine+
  'Start: Windows per-user scheduled task at sign-in'+[Environment]::NewLine+
  'Crash recovery: up to 20 retries at one-minute intervals'+[Environment]::NewLine+
  'Private state: '+$root+[Environment]::NewLine+
  'Folder changes require approval and a brief service restart.') 20 74 665 190
$btnStart=Add-Button $settingsPage 'Start service' 20 285 130
$btnStop=Add-Button $settingsPage 'Stop service' 165 285 130
$btnOpenState=Add-Button $settingsPage 'Open private state' 310 285 155

function Refresh-Overview {
 $s=Invoke-DeskSom @('status','--state',$root) -AllowAttention
 $local=if($s.localReady){'Responding'}elseif($s.operatorStopped){'Stopped by owner'}else{'Needs attention'}
 $tunnel=if($s.tunnelReady){'Connected locally (ChatGPT call not verified)'}else{'Not currently ready'}
 $info.Text=('Local service: '+$local+[Environment]::NewLine+
   'Private tunnel: '+$tunnel+[Environment]::NewLine+
   'Version: '+$s.version+[Environment]::NewLine+
   'Root configuration revision: '+$s.rootsRevision+[Environment]::NewLine+
   'Startup: At Windows sign-in; automatic task restarts on process failure')
}
function Refresh-Folders {
 $r=Invoke-DeskSom @('folders','--action','list','--state',$root)
 $folderList.Items.Clear()
 foreach($d in $r.directories){[void]$folderList.Items.Add([string]$d)}
 $folderHint.Text=('Revision '+$r.revision+'. Terminal commands still have full Windows-account permissions.')
}
function Refresh-Statistics {
 $r=Invoke-DeskSom @('status','--state',$root) -AllowAttention
 $m=$r.statistics
 if(-not $m){$statsText.Text='Statistics unavailable while the local service is stopped or unreachable.';return}
 $lines=@(
  'Scope: Current DeskSom broker boot',
  ('Uptime: '+[math]::Floor($m.uptimeSeconds/60)+' minutes'),
  ('Tool calls attempted: '+$m.attempted),
  ('Successful: '+$m.succeeded),
  ('Tool errors: '+$m.rejected),
  ('Outcome uncertain: '+$m.uncertain),
  ('Active: '+$m.active),
  ('Average completed call: '+$m.avgElapsedMs+' ms'),
  ('Most recent completed: '+$m.lastCompletedAt),
  '',
  'Top tools this session:'
 )
 foreach($t in $m.tools){$lines+=('  '+$t.name+': '+$t.completed+' completed, '+$t.failed+' errors')}
 $statsText.Text=$lines -join [Environment]::NewLine
}
function Change-Folders($request){
 $nonce=[guid]::NewGuid().ToString('N')
 $requestFile=Join-Path $root ('roots-request-'+$nonce+'.json')
 $proposalFile=Join-Path $root ('roots-proposal-'+$nonce+'.json')
 [IO.File]::WriteAllText($requestFile,($request|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
 $planned=Invoke-DeskSom @('folders','--action','plan','--state',$root,'--request',$requestFile,'--out',$proposalFile)
 $next=$planned.proposal.nextDirectories -join [Environment]::NewLine
 $prompt="Change DeskSom file-tool folders to:"+[Environment]::NewLine+[Environment]::NewLine+
   $next+[Environment]::NewLine+[Environment]::NewLine+
   "The local service (and tunnel if configured) will briefly restart. This does not restrict terminal commands."+
   [Environment]::NewLine+'Proceed?'
 $yes=[Windows.Forms.MessageBox]::Show($prompt,'Approve folder change',[Windows.Forms.MessageBoxButtons]::YesNo,[Windows.Forms.MessageBoxIcon]::Question)
 if($yes -ne [Windows.Forms.DialogResult]::Yes){return}
 $done=Invoke-DeskSom @('folders','--action','apply','--state',$root,'--plan',$proposalFile,'--approve',$planned.proposal.approvalSha256,'--confirm-restart')
 [void][Windows.Forms.MessageBox]::Show('Folder configuration updated to revision '+$done.rootsRevision+'.','DeskSom',[Windows.Forms.MessageBoxButtons]::OK,[Windows.Forms.MessageBoxIcon]::Information)
 Refresh-Folders
}
$btnAdd.Add_Click({
 try{
  $dialog=New-Object Windows.Forms.FolderBrowserDialog
  $dialog.Description='Choose an existing folder for DeskSom file tools'
  $dialog.ShowNewFolderButton=$false
  if($dialog.ShowDialog($form) -eq [Windows.Forms.DialogResult]::OK){
   Change-Folders @{addDirectories=@($dialog.SelectedPath)}
  }
 }catch{Show-Error $_}
})
$btnRemove.Add_Click({
 try{
  if(-not $folderList.SelectedItem){return}
  Change-Folders @{removeDirectories=@([string]$folderList.SelectedItem)}
 }catch{Show-Error $_}
})
$btnOverview.Add_Click({try{Refresh-Overview}catch{Show-Error $_}})
$btnStats.Add_Click({try{Refresh-Statistics}catch{Show-Error $_}})
$btnStart.Add_Click({
 try{
  $s=Invoke-DeskSom @('start','--state',$root,'--enable')
  Refresh-Overview
  [void][Windows.Forms.MessageBox]::Show('Local services started.','DeskSom')
 }catch{Show-Error $_}
})
$btnStop.Add_Click({
 if([Windows.Forms.MessageBox]::Show('Stop the owned DeskSom services? This can interrupt active tool calls.','DeskSom',[Windows.Forms.MessageBoxButtons]::YesNo) -ne 'Yes'){return}
 try{
  $s=Invoke-DeskSom @('stop','--state',$root,'--confirm-stop')
  Refresh-Overview
  [void][Windows.Forms.MessageBox]::Show('DeskSom stopped. It will stay stopped until you explicitly start it.','DeskSom')
 }catch{Show-Error $_}
})
$btnOpenState.Add_Click({Start-Process explorer.exe -ArgumentList ('"'+$root+'"')})
$tabs.Add_SelectedIndexChanged({
 try {
  switch($tabs.SelectedTab.Name){
   'Overview' {Refresh-Overview}
   'Folders' {Refresh-Folders}
   'Statistics' {Refresh-Statistics}
  }
 }catch{Show-Error $_}
})
$form.Add_Shown({
 try{
  switch($tabs.SelectedTab.Name){
   'Folders' {Refresh-Folders}
   'Statistics' {Refresh-Statistics}
   default {Refresh-Overview}
  }
 }catch{Show-Error $_}
})
[void]$form.ShowDialog()
$form.Dispose()
