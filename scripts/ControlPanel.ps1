#requires -Version 5.1
[CmdletBinding()]
param(
  [string]$StateFile,
  [ValidateSet('Overview','Folders','Statistics','Settings')][string]$Tab='Overview',
  [switch]$PreviewOnly,
  [switch]$LayoutCheck
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'WinForms-Dpi.ps1')
. (Join-Path $PSScriptRoot 'Ui-Command.ps1')
$script:uiScale=Enable-DeskSomHighDpi
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
if($PreviewOnly -or $LayoutCheck){
  # Read-only visual fixture. No service, CLI, task, plan, or credential access.
  $state=[pscustomobject]@{plan=[pscustomobject]@{
    instance='layout-preview';version='0.2.0-layout-preview';port=19688;
    stateRoot='C:\Preview\DeskSom\layout-preview'
  }}
  $node=$null;$cli=$null;$root=$state.plan.stateRoot
}else{
  if([string]::IsNullOrWhiteSpace($StateFile)){throw 'An installed state file is required.'}
  $state=Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8|ConvertFrom-Json
  if($state.plan.binding.host -cne [Environment]::MachineName -or
     $state.plan.binding.sid -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value){
    throw 'This DeskSom installation belongs to another Windows host or account.'
  }
  $node=$state.environment.node
  $cli=Join-Path $state.runtimeRoot 'scripts\cli.mjs'
  if(-not(Test-Path -LiteralPath $cli -PathType Leaf)){throw 'DeskSom runtime is missing. Do not repair or reinstall blindly.'}
  $root=$state.plan.stateRoot
}

function Invoke-DeskSom([string[]]$Arguments,[switch]$AllowAttention){
  if($PreviewOnly -or $LayoutCheck){throw 'Visual preview cannot run service commands.'}
  $raw=& $node $cli @Arguments --json
  $code=$LASTEXITCODE
  $json=($raw -join [Environment]::NewLine)|ConvertFrom-Json
  if($code -ne 0 -and (-not $AllowAttention)){
    $msg=if($json.error){$json.error.message+'  '+$json.error.nextAction}else{'The command did not succeed.'}
    throw $msg
  }
  return $json
}
function Invoke-DeskSomResponsive([string[]]$Arguments,$Owner) {
 if($PreviewOnly -or $LayoutCheck){throw 'Visual preview cannot run service commands.'}
 $result=Show-DeskSomUiCommand -Executable $node -Arguments (@($cli)+$Arguments+@('--json')) -Owner $Owner -Message (
  'Processing the owner request. This window remains responsive. Indexing large folders continues independently after the core service reconnects.')
 try{$json=$result.Stdout|ConvertFrom-Json}catch{throw 'The command returned an unreadable result. Inspect its receipt before retrying.'}
 if($result.ExitCode -ne 0){
  $message='The command did not succeed. Inspect its private receipt before retrying.'
  if($json.PSObject.Properties['error'] -and $json.error){
   if($json.error.PSObject.Properties['message']){$message=[string]$json.error.message}
   if($json.error.PSObject.Properties['nextAction']){$message+=' '+[string]$json.error.nextAction}
  }
  throw $message
 }
 return $json
}
function Show-Error($exception){
  [void][Windows.Forms.MessageBox]::Show([string]$exception.Exception.Message,'DeskSom',[Windows.Forms.MessageBoxButtons]::OK,[Windows.Forms.MessageBoxIcon]::Warning)
}
$form=New-Object Windows.Forms.Form
$form.AutoScaleMode='None'
$form.Text=if($PreviewOnly -or $LayoutCheck){'DeskSom  |  visual preview (sample data)'}else{'DeskSom  |  '+$state.plan.instance}
$form.StartPosition='CenterScreen'
$form.ClientSize=[Drawing.Size]::new(660,385)
$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false
$form.Font=New-Object Drawing.Font('Segoe UI',9)
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
function Add-Label($parent,$text,[int]$x,[int]$y,[int]$w=600,[int]$h=28){
 $label=New-Object Windows.Forms.Label
 $label.Text=$text;$label.Location=[Drawing.Point]::new($x,$y)
 $label.Size=[Drawing.Size]::new($w,$h)
 $parent.Controls.Add($label)
 return $label
}
function Add-Heading($parent,[string]$text){
 $label=Add-Label $parent $text 24 16 600 30
 $label.Font=New-Object Drawing.Font('Segoe UI',11,[Drawing.FontStyle]::Bold)
 $label.ForeColor=[Drawing.Color]::FromArgb(38,50,65)
 return $label
}
function Add-Field($parent,[string]$name,[int]$y,[int]$x=18,[int]$labelWidth=150,[int]$valueWidth=0){
 $label=Add-Label $parent $name $x $y $labelWidth 27
 $label.ForeColor=[Drawing.Color]::FromArgb(80,88,96)
 if($valueWidth -le 0){$valueWidth=575-$x-$labelWidth-8}
 $value=Add-Label $parent 'Checking...' ($x+$labelWidth+8) $y $valueWidth 27
 return $value
}
$overview=$tabs.TabPages['Overview']
$overviewHeading=Add-Heading $overview 'Connection overview'
$overviewHeading.Width=440
$btnOverview=Add-Button $overview 'Refresh' 507 16 126
[void](Add-Label $overview 'Local readiness is separate from a working ChatGPT connection.' 24 54 600 28)
$statusGroup=New-Object Windows.Forms.GroupBox
$statusGroup.Text='Status';$statusGroup.Location=[Drawing.Point]::new(24,89)
$statusGroup.Size=[Drawing.Size]::new(610,188)
$overview.Controls.Add($statusGroup)
$localValue=Add-Field $statusGroup 'Local service' 31
$tunnelValue=Add-Field $statusGroup 'Private tunnel' 60
$versionValue=Add-Field $statusGroup 'Version' 89
$revisionValue=Add-Field $statusGroup 'Folder revision' 118
$startupValue=Add-Field $statusGroup 'Startup' 147
$indexSummary=Add-Label $overview 'Fast search: checking optional index status...' 24 282 610 27
$indexSummary.AutoEllipsis=$true
$btnChatSetup=Add-Button $overview 'Finish ChatGPT setup' 24 315 202
$btnInspection=Add-Button $overview 'Project inspection...' 241 315 190
$btnInspection.Add_Click({try{Configure-ProjectInspection}catch{Show-Error $_}})
$foldersPage=$tabs.TabPages['Folders']
[void](Add-Heading $foldersPage 'Folders ChatGPT can access')
[void](Add-Label $foldersPage 'These folders are available to file tools; terminal commands are not sandboxed.' 24 53 603 30)
$folderList=New-Object Windows.Forms.ListBox
$folderList.Font=New-Object Drawing.Font('Segoe UI',9)
$folderList.Location=[Drawing.Point]::new(24,89)
$folderList.Size=[Drawing.Size]::new(610,183)
$folderList.HorizontalScrollbar=$true
$foldersPage.Controls.Add($folderList)
$folderHint=Add-Label $foldersPage 'Folder configuration revision: checking...' 24 280 600 27
$btnAdd=Add-Button $foldersPage 'Add folder...' 24 315 135
$btnRemove=Add-Button $foldersPage 'Remove selected...' 174 315 155
$btnRefreshFolders=Add-Button $foldersPage 'Refresh' 344 315 110
$btnFastIndex=Add-Button $foldersPage 'Fast search...' 464 315 169
$btnRefreshFolders.Add_Click({try{Refresh-Folders}catch{Show-Error $_}})
$btnFastIndex.Add_Click({try{Configure-IndexedSearch}catch{Show-Error $_}})

$statsPage=$tabs.TabPages['Statistics']
[void](Add-Heading $statsPage 'Statistics')
[void](Add-Label $statsPage 'Lightweight counters for the current broker session; reset on restart.' 24 54 604 28)
$statsGroup=New-Object Windows.Forms.GroupBox
$statsGroup.Text='Activity';$statsGroup.Location=[Drawing.Point]::new(24,89)
$statsGroup.Size=[Drawing.Size]::new(610,189)
$statsPage.Controls.Add($statsGroup)
$statsValues=@{}
$statsRows=@(
 @('Uptime','uptime','Attempted','attempted'),
 @('Successful','succeeded','Tool errors','rejected'),
 @('Uncertain','uncertain','Active','active'),
 @('Average call','avgElapsedMs','Last completed','lastCompletedAt')
)
for($i=0;$i -lt $statsRows.Count;$i++){
 $y=31+$i*36
 $entry=$statsRows[$i]
 $statsValues[$entry[1]]=Add-Field $statsGroup $entry[0] $y 18 106 148
 $statsValues[$entry[3]]=Add-Field $statsGroup $entry[2] $y 309 112 155
}
$topTools=Add-Label $statsPage 'Top tools: No calls recorded yet.' 24 285 610 23
$topTools.AutoEllipsis=$true
$btnStats=Add-Button $statsPage 'Refresh statistics' 24 315 157

$settingsPage=$tabs.TabPages['Settings']
[void](Add-Heading $settingsPage 'Service settings')
[void](Add-Label $settingsPage 'DeskSom runs under your Windows account after you sign in.' 24 54 600 28)
$settingsGroup=New-Object Windows.Forms.GroupBox
$settingsGroup.Text='Installation';$settingsGroup.Location=[Drawing.Point]::new(24,89)
$settingsGroup.Size=[Drawing.Size]::new(610,211)
$settingsPage.Controls.Add($settingsGroup)
$settingsLabels=@(
 @('Instance',$state.plan.instance),
 @('Version',$state.plan.version),
 @('Local port',[string]$state.plan.port),
 @('Starts','At Windows sign-in'),
 @('Crash recovery','Up to 20 retries, one minute apart')
)
for($i=0;$i -lt $settingsLabels.Count;$i++){
 $label=Add-Field $settingsGroup $settingsLabels[$i][0] (26+$i*27) 18 124
 $label.Text=$settingsLabels[$i][1]
}
[void](Add-Label $settingsGroup 'Private state' 18 173 124 27)
$statePath=Add-Label $settingsGroup $root 150 171 435 35
$statePath.AutoEllipsis=$true
$btnStart=Add-Button $settingsPage 'Start service' 24 315 135
$btnStop=Add-Button $settingsPage 'Stop service' 174 315 135
$btnOpenState=Add-Button $settingsPage 'Open private state' 324 315 165

function Refresh-Overview {
 $s=Invoke-DeskSom @('status','--state',$root) -AllowAttention
 $localValue.Text=if($s.localReady){'Responding'}elseif($s.operatorStopped){'Stopped by owner'}else{'Needs attention'}
 $tunnelValue.Text=if($s.tunnelReady){'Locally ready (ChatGPT call not verified)'}else{'Not configured or not ready'}
 $versionValue.Text=[string]$s.version
 $revisionValue.Text=[string]$s.rootsRevision
 $startupValue.Text='At Windows sign-in'
 $btnInspection.Text='Project inspection...'
 if($s.PSObject.Properties['projectInspection'] -and $null -ne $s.projectInspection){
  $btnInspection.Text=if(-not $s.projectInspection.enabled){'Inspection: off...'}elseif($s.projectInspection.ready){'Inspection: on...'}else{'Inspection: attention...'}
 }
 $indexSummary.Text='Fast search: status unavailable; ordinary tools are separate.'
 if($s.PSObject.Properties['indexStatus'] -and $null -ne $s.indexStatus){
  if(-not $s.indexStatus.enabled){$indexSummary.Text='Fast search: disabled. Ordinary file and terminal tools are unchanged.'}
  else{
   $all=@($s.indexStatus.roots);$readyRoots=@($all|Where-Object {$_.ready})
   $indexSummary.Text=('Fast search: '+$readyRoots.Count+'/'+$all.Count+' folders ready. Use Folders > Fast search for details.')
  }
 }
}
function Refresh-Folders {
 $r=Invoke-DeskSom @('folders','--action','list','--state',$root)
 $folderList.Items.Clear()
 foreach($d in $r.directories){[void]$folderList.Items.Add([string]$d)}
 $folderHint.Text=('Folder configuration revision: '+$r.revision+'. Changes require your approval.')
}
function Refresh-Statistics {
 $r=Invoke-DeskSom @('status','--state',$root) -AllowAttention
 $m=$r.statistics
 if(-not $m){
   foreach($value in $statsValues.Values){$value.Text='Unavailable'}
   $topTools.Text='No statistics available while the service is stopped.'
   return
 }
 $statsValues['uptime'].Text=([string][math]::Floor($m.uptimeSeconds/60)+' minutes')
 foreach($field in @('attempted','succeeded','rejected','uncertain','active')){
   $statsValues[$field].Text=[string]$m.$field
 }
 $statsValues['avgElapsedMs'].Text=([string]$m.avgElapsedMs+' ms')
 $statsValues['lastCompletedAt'].Text=if($m.lastCompletedAt){
   ([DateTimeOffset]::Parse([string]$m.lastCompletedAt)).ToLocalTime().ToString('HH:mm:ss')
 }else{'None'}
 $names=@($m.tools | Select-Object -First 3 | ForEach-Object { $_.name+': '+$_.completed })
 $topTools.Text=if($names.Count){'Top tools: '+($names -join '    ')}else{'Top tools: No calls recorded yet.'}
}
function Configure-ProjectInspection {
 if($PreviewOnly -or $LayoutCheck){return}
 $current=Invoke-DeskSomResponsive @('inspection','--action','list','--state',$root) -Owner $form
 if($current.status -eq 'INSPECTION_CHANGE_INTERRUPTED'){
  $message='An inspection change is unfinished ('+$current.pendingPhase+'). Restore the previous approved setting? The guarded rollback leaves the local broker stopped and never replays Apply.'
  if([Windows.Forms.MessageBox]::Show($message,'Recover project inspection',[Windows.Forms.MessageBoxButtons]::YesNo) -ne 'Yes'){return}
  $result=Invoke-DeskSomResponsive @('inspection','--action','rollback','--state',$root,'--confirm-rollback') -Owner $form
  [void][Windows.Forms.MessageBox]::Show($result.status+'. Review state, then use Start service.','DeskSom')
  return
 }
 $next=-not [bool]$current.enabled
 $nonce=[Guid]::NewGuid().ToString('N')
 $request=Join-Path $root ('inspection-request-'+$nonce+'.json')
 $proposal=Join-Path $root ('inspection-proposal-'+$nonce+'.json')
 [IO.File]::WriteAllText($request,(@{enabled=$next}|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
 $planned=Invoke-DeskSomResponsive @('inspection','--action','plan','--state',$root,'--request',$request,'--out',$proposal) -Owner $form
 $verb=if($next){'Enable'}else{'Disable'}
 $message=$verb+' read-only project inspection?'+[Environment]::NewLine+[Environment]::NewLine+
  'It reports Git state and project hints inside approved folders. It does not run project scripts or write Git.'+[Environment]::NewLine+
  'Only the local broker restarts. The tunnel and credentials remain unchanged; active indexing may reconcile after restart.'+[Environment]::NewLine+
  'Refresh this connection in ChatGPT afterward to update its tool list.'+[Environment]::NewLine+[Environment]::NewLine+
  'Plan SHA-256: '+$planned.proposal.approvalSha256
 if([Windows.Forms.MessageBox]::Show($message,'Approve project inspection',[Windows.Forms.MessageBoxButtons]::YesNo,[Windows.Forms.MessageBoxIcon]::Question) -ne 'Yes'){return}
 $result=Invoke-DeskSomResponsive @('inspection','--action','apply','--state',$root,'--plan',$proposal,'--approve',$planned.proposal.approvalSha256,'--confirm-restart') -Owner $form
 [void][Windows.Forms.MessageBox]::Show($result.status+'. '+$result.nextAction,'DeskSom')
 Refresh-Overview
}
function Configure-IndexedSearch {
 if($LayoutCheck){return}
 $current=if($PreviewOnly){[pscustomobject]@{status='PREVIEW_ONLY';enabled=$false;allowedDirectories=@('C:\DL','C:\Projects','C:\Apps');roots=@();periodicMinutes=30}}else{Invoke-DeskSom @('index','--action','list','--state',$root)}
 if($current.status -eq 'INDEX_CHANGE_INTERRUPTED'){
  $question='A previous indexed-search change stopped partway through ('+$current.pendingPhase+').' + [Environment]::NewLine +
    'Attempt the guarded rollback? It will verify owned service identity and stop only an idle owned service. It never restarts.'
  if([Windows.Forms.MessageBox]::Show($question,'Recover indexed search',[Windows.Forms.MessageBoxButtons]::YesNo,[Windows.Forms.MessageBoxIcon]::Warning) -ne 'Yes'){return}
  $result=Invoke-DeskSomResponsive @('index','--action','rollback','--state',$root,'--confirm-rollback') -Owner $form
  [void][Windows.Forms.MessageBox]::Show($result.status+'; use Start service after inspecting the installation.','DeskSom')
  return
 }
 $dialog=New-Object Windows.Forms.Form
 $dialog.Text='DeskSom | Fast filename search';$dialog.StartPosition='CenterParent'
 $dialog.ClientSize=[Drawing.Size]::new(580,415)
 $dialog.FormBorderStyle='FixedDialog';$dialog.MaximizeBox=$false
 $dialog.Font=New-Object Drawing.Font('Segoe UI',9)
 $enabled=New-Object Windows.Forms.CheckBox
 $enabled.Text='Enable fast indexed filename search';$enabled.Location=[Drawing.Point]::new(20,16)
 $enabled.Size=[Drawing.Size]::new(510,30);$enabled.Checked=[bool]$current.enabled
 $dialog.Controls.Add($enabled)
 $about=Add-Label $dialog 'Index only selected folders. Needs Node 25+. Files stay local; regular search still works.' 20 55 530 42
 $list=New-Object Windows.Forms.CheckedListBox
 $list.Location=[Drawing.Point]::new(20,104);$list.Size=[Drawing.Size]::new(540,188)
 $list.CheckOnClick=$true;$list.HorizontalScrollbar=$true;$list.DisplayMember='Label'
 foreach($dir in @($current.allowedDirectories)){
  $checked=([bool]$current.enabled -and @($current.roots) -contains [string]$dir)
  $label=[string]$dir
  if($current.PSObject.Properties['runtime'] -and $null -ne $current.runtime){
   $details=@($current.runtime.roots|Where-Object {$_.root -ieq [string]$dir})
   if($details.Count){
    $detail=$details[0];$label+='  ['+[string]$detail.state+']'
    if($detail.PSObject.Properties['errorCode'] -and $detail.errorCode){$label+=' '+[string]$detail.errorCode}
    elseif($detail.PSObject.Properties['progress'] -and $detail.progress){$label+=' '+[string]$detail.progress.directoriesVisited+' folders scanned'}
   }
  }
  [void]$list.Items.Add([pscustomobject]@{Root=[string]$dir;Label=$label},$checked)
 }
 $dialog.Controls.Add($list)
 $interval=Add-Label $dialog 'Check for missed changes every:' 20 302 225 26
 $minutes=New-Object Windows.Forms.ComboBox
 $minutes.DropDownStyle='DropDownList';$minutes.Location=[Drawing.Point]::new(255,300)
 $minutes.Size=[Drawing.Size]::new(145,27)
 foreach($item in @('15 minutes','30 minutes','60 minutes','120 minutes')){[void]$minutes.Items.Add($item)}
 $chosen=[int]$current.periodicMinutes
 $option=($chosen.ToString()+' minutes')
 if($minutes.Items.Contains($option)){$minutes.SelectedItem=$option}else{$minutes.SelectedItem='30 minutes'}
 $dialog.Controls.Add($minutes)
 $note=Add-Label $dialog 'Saving requires your approval and a brief service restart. Files and credentials are retained.' 20 333 550 28
 $review=Add-Button $dialog 'Review change' 288 373 135
 $cancel=Add-Button $dialog 'Cancel' 434 373 125
 $cancel.Add_Click({$dialog.DialogResult=[Windows.Forms.DialogResult]::Cancel;$dialog.Close()})
 $enabled.Add_CheckedChanged({$list.Enabled=$enabled.Checked;$minutes.Enabled=$enabled.Checked})
 $list.Enabled=$enabled.Checked;$minutes.Enabled=$enabled.Checked
 if($PreviewOnly){$review.Enabled=$false;$note.Text='PREVIEW ONLY: No changes can be saved. Review change is disabled.'}
 $review.Add_Click({
  if($PreviewOnly){return}
  try{
   $selection=@()
   if($enabled.Checked){foreach($item in @($list.CheckedItems)){$selection+=[string]$item.Root}}
   if($enabled.Checked -and $selection.Count -eq 0){throw 'Select at least one folder to index.'}
   $mins=if($enabled.Checked){[int]($minutes.SelectedItem.ToString().Split(' ')[0])}else{30}
   $request=@{enabled=[bool]$enabled.Checked;roots=$selection;periodicMinutes=$mins}
   $nonce=[Guid]::NewGuid().ToString('N')
   $requestFile=Join-Path $root ('index-request-'+$nonce+'.json')
   $proposalFile=Join-Path $root ('index-proposal-'+$nonce+'.json')
   [IO.File]::WriteAllText($requestFile,($request|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
   $planned=Invoke-DeskSomResponsive @('index','--action','plan','--state',$root,'--request',$requestFile,'--out',$proposalFile) -Owner $dialog
   $lines=if($enabled.Checked){$selection -join [Environment]::NewLine}else{'Disabled (existing private index data retained)'}
   $message='Proposed indexed search change:'+[Environment]::NewLine+[Environment]::NewLine+$lines+
     [Environment]::NewLine+[Environment]::NewLine+'Recovery check: '+$mins+' minutes'+
     [Environment]::NewLine+'Plan SHA-256: '+$planned.proposal.approvalSha256+
     [Environment]::NewLine+[Environment]::NewLine+'Restart the owned service and apply this plan?'
   if([Windows.Forms.MessageBox]::Show($message,'Approve indexed search',[Windows.Forms.MessageBoxButtons]::YesNo,[Windows.Forms.MessageBoxIcon]::Question) -ne 'Yes'){return}
   $result=Invoke-DeskSomResponsive @('index','--action','apply','--state',$root,'--plan',$proposalFile,'--approve',$planned.proposal.approvalSha256,'--confirm-restart') -Owner $dialog
   [void][Windows.Forms.MessageBox]::Show('Settings saved. '+$result.status+'. Indexing may continue while ordinary tools are available. Refresh the Overview for progress.','DeskSom')
   $dialog.DialogResult=[Windows.Forms.DialogResult]::OK;$dialog.Close()
  }catch{Show-Error $_}
 })
 if($script:uiScale -ne 1.0){$dialog.Scale([Drawing.SizeF]::new($script:uiScale,$script:uiScale))}
 [void]$dialog.ShowDialog($form);$dialog.Dispose()
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
$btnChatSetup.Add_Click({
 try{
  $association=Join-Path $root 'connection.json'
  $currentState=Get-Content -LiteralPath (Join-Path $root 'install.json') -Raw -Encoding UTF8|ConvertFrom-Json
  if($currentState.credentialsConfigured -eq $true -and
     (Test-Path -LiteralPath $association -PathType Leaf)){
    $app=Join-Path $state.runtimeRoot 'scripts\ChatGPT-Connection-Guide.ps1'
    $args=@('-NoProfile','-STA','-File',('"' + $app + '"'),'-StateRoot',('"' + $root + '"'))
  }else{
    $app=Join-Path $state.runtimeRoot 'scripts\Configure-Tunnel.ps1'
    $args=@('-NoProfile','-STA','-File',('"' + $app + '"'),'-StateRoot',('"' + $root + '"'),'-Graphical','-OpenSettings')
  }
  Start-Process -FilePath $state.environment.pwsh -ArgumentList $args | Out-Null
 }catch{Show-Error $_}
})
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
 if($PreviewOnly -or $LayoutCheck){return}
 try {
  switch($tabs.SelectedTab.Name){
   'Overview' {Refresh-Overview}
   'Folders' {Refresh-Folders}
   'Statistics' {Refresh-Statistics}
  }
 }catch{Show-Error $_}
})
$form.Add_Shown({
 if($PreviewOnly){return}
 try{
  switch($tabs.SelectedTab.Name){
   'Folders' {Refresh-Folders}
   'Statistics' {Refresh-Statistics}
   default {Refresh-Overview}
  }
 }catch{Show-Error $_}
})
if($PreviewOnly -or $LayoutCheck){
 $localValue.Text='Responding';$tunnelValue.Text='Not configured'
 $versionValue.Text='0.2.0-layout-preview';$revisionValue.Text='0'
 $startupValue.Text='At Windows sign-in'
 $indexSummary.Text='Fast search: sample status only; no installed service is queried.'
 [void]$folderList.Items.Add('C:\Projects\Example\MyProject')
 $folderHint.Text='Sample folder list. Changes are disabled in visual preview.'
 $statsValues['uptime'].Text='775 minutes'
 $statsValues['attempted'].Text='42'
 $statsValues['succeeded'].Text='40'
 $statsValues['rejected'].Text='2'
 $statsValues['uncertain'].Text='0'
 $statsValues['active'].Text='0'
 $statsValues['avgElapsedMs'].Text='85 ms'
 $statsValues['lastCompletedAt'].Text='12:34:56'
 $topTools.Text='Top tools: read_file: 24    start_process: 9'
 foreach($button in @($btnOverview,$btnChatSetup,$btnInspection,$btnAdd,$btnRemove,$btnRefreshFolders,$btnFastIndex,$btnStats,$btnStart,$btnStop,$btnOpenState)){
   $button.Enabled=$false
 }
 if($PreviewOnly){$btnFastIndex.Enabled=$true}
}
if($script:uiScale -ne 1.0){$form.Scale([Drawing.SizeF]::new($script:uiScale,$script:uiScale))}
if($LayoutCheck){
 $invalid=@()
 # A hidden TabPage has zero ClientSize until ShowDialog; derive the
 # usable tab-page rectangle from the actual scaled form client rectangle.
 $pageWidth=$form.ClientSize.Width-[int][math]::Ceiling(12*$script:uiScale)
 $pageHeight=$form.ClientSize.Height-[int][math]::Ceiling(30*$script:uiScale)
 foreach($page in $tabs.TabPages){
  foreach($control in $page.Controls){
   if($control.Left -lt 0 -or $control.Top -lt 0 -or
      $control.Right -gt $pageWidth -or
      $control.Bottom -gt $pageHeight){
    $invalid+=($page.Name+':'+$control.GetType().Name+':'+$control.Text)
   }
   if($control -is [Windows.Forms.GroupBox]){
    foreach($child in $control.Controls){
      if($child.Left -lt 0 -or $child.Top -lt 0 -or
         $child.Right -gt $control.ClientSize.Width -or
         $child.Bottom -gt $control.ClientSize.Height){
         $invalid+=($page.Name+':group:'+ $child.Text)
      }
    }
   }
  }
  foreach($parent in @($page)+@($page.Controls|Where-Object {$_ -is [Windows.Forms.GroupBox]})){
   $siblings=@($parent.Controls)
   for($i=0;$i -lt $siblings.Count;$i++){
    for($j=$i+1;$j -lt $siblings.Count;$j++){
     if($siblings[$i].Bounds.IntersectsWith($siblings[$j].Bounds)){
      $invalid+=($page.Name+':overlap:'+ $siblings[$i].Text+':'+$siblings[$j].Text)
     }
    }
   }
  }
 }
 $screen=[Windows.Forms.Screen]::PrimaryScreen.WorkingArea
 $result=[ordered]@{
  schemaVersion='desksom.control-panel-layout/v1'
  result=if($invalid.Count){'FAIL'}else{'PASS'}
  uiScale=$script:uiScale
  windowWidth=$form.Width;windowHeight=$form.Height
  availableWidth=$screen.Width;availableHeight=$screen.Height
  pageCount=$tabs.TabPages.Count;offscreenControlCount=$invalid.Count
  offscreenControls=$invalid
  noServiceCommands=$true
 }
 $result|ConvertTo-Json -Compress -Depth 4
 if($invalid.Count -or $form.Width -gt $screen.Width -or $form.Height -gt $screen.Height){
  throw 'Control panel layout does not fit this display.'
 }
}else{
 [void]$form.ShowDialog()
}
$form.Dispose()
