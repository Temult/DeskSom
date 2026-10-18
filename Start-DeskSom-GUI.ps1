#requires -Version 5.1
[CmdletBinding()]
param([ValidatePattern('^[a-z][a-z0-9-]{0,23}$')][string]$Instance='default',[ValidateRange(1024,65535)][int]$Port=18789,[switch]$LayoutCheck,[switch]$PreviewOnly,[string]$PreviewFolder='',[switch]$StartupCheck)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'scripts\WinForms-Dpi.ps1')
$script:uiScale=Enable-DeskSomHighDpi
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
. (Join-Path $PSScriptRoot 'scripts\Gui-Install-Result.ps1')
$root=$PSScriptRoot
$onboarding=Join-Path $env:LOCALAPPDATA 'DeskSom-Onboarding'
$planFile=Join-Path $onboarding ($Instance+'-plan.json')
$script:node=$null;$script:pwsh=$null;$script:ready=$false
$script:installed=$false;$script:plan=$null;$script:running=$null
$script:stdout=$null;$script:stderr=$null
$script:reviewSummary=''

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
  throw (Get-DeskSomInstallIssue $result 'DeskSom reported an unsuccessful operation. Inspect its saved receipts.')
 }
 return $result
}
function Report([string]$message,[bool]$warning=$false){
 $ico=if($warning){[Windows.Forms.MessageBoxIcon]::Warning}else{[Windows.Forms.MessageBoxIcon]::Information}
 [void][Windows.Forms.MessageBox]::Show($form,$message,'DeskSom Setup',[Windows.Forms.MessageBoxButtons]::OK,$ico)
}


$form=New-Object Windows.Forms.Form
$form.AutoScaleMode='None'
$form.Text=if($PreviewOnly){'DeskSom Setup (visual preview only)'}else{'DeskSom Setup'}
$form.ClientSize=[Drawing.Size]::new(650,400)
$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false
$form.StartPosition='CenterScreen';$form.BackColor=[Drawing.Color]::White
$form.Font=New-Object Drawing.Font('Segoe UI',10)
$script:page=1
$script:checksReady=$false

function New-WizardLabel($parent,[string]$message,[int]$x,[int]$y,[int]$w,[int]$h,[int]$fontSize=10,[bool]$bold=$false) {
 $control=New-Object Windows.Forms.Label
 $control.Text=$message
 $control.Location=[Drawing.Point]::new($x,$y)
 $control.Size=[Drawing.Size]::new($w,$h)
 $style=if($bold){[Drawing.FontStyle]::Bold}else{[Drawing.FontStyle]::Regular}
 $control.Font=New-Object Drawing.Font('Segoe UI',$fontSize,$style)
 $parent.Controls.Add($control)
 return $control
}
function New-WizardButton($parent,[string]$title,[int]$x,[int]$y,[int]$w=110,[int]$h=33) {
 $control=New-Object Windows.Forms.Button
 $control.Text=$title
 $control.Location=[Drawing.Point]::new($x,$y)
 $control.Size=[Drawing.Size]::new($w,$h)
 $parent.Controls.Add($control)
 return $control
}
$brand=New-WizardLabel $form 'DeskSom Setup' 24 15 380 40 17 $true
$stepIndicator=New-WizardLabel $form 'Step 1 of 3' 478 26 145 27 9
$divider=New-Object Windows.Forms.Label
$divider.BorderStyle='Fixed3D'
$divider.Location=[Drawing.Point]::new(24,73)
$divider.Size=[Drawing.Size]::new(600,2)
$form.Controls.Add($divider)
$pageTitle=New-WizardLabel $form 'Choose a folder ChatGPT can access' 24 92 595 38 14 $true

$pages=@()
for($n=0;$n -lt 3;$n++) {
 $panel=New-Object Windows.Forms.Panel
 $panel.Location=[Drawing.Point]::new(24,140)
 $panel.Size=[Drawing.Size]::new(600,180)
 $panel.Visible=($n -eq 0)
 $form.Controls.Add($panel)
 $pages+=,$panel
}
$startPage=$pages[0]
$summaryPage=$pages[1]
$connectPage=$pages[2]

[void](New-WizardLabel $startPage 'Choose an existing folder. ChatGPT can work with its files.' 0 4 595 43 10)
$folder=New-Object Windows.Forms.TextBox
$folder.Location=[Drawing.Point]::new(0,59)
$folder.Size=[Drawing.Size]::new(463,31)
$folder.AccessibleName='Folder ChatGPT can access'
$startPage.Controls.Add($folder)
$browse=New-WizardButton $startPage 'Browse...' 476 57 122 36
[void](New-WizardLabel $startPage 'You can add or remove folders later in the DeskSom control panel.' 0 118 595 50 9)

[void](New-WizardLabel $summaryPage 'DeskSom will run privately when you sign in to Windows.' 0 0 594 32 10)
$overview=New-WizardLabel $summaryPage 'Review the folder and access permissions before installing.' 0 35 595 73 9
$overview.ForeColor=[Drawing.Color]::FromArgb(65,72,80)
$progress=New-Object Windows.Forms.ProgressBar
$progress.Location=[Drawing.Point]::new(0,119)
$progress.Size=[Drawing.Size]::new(595,15)
$summaryPage.Controls.Add($progress)
$status=New-WizardLabel $summaryPage 'Checking this computer...' 0 143 590 36 9

$statusConnect=New-WizardLabel $connectPage 'DeskSom is ready on this computer.' 0 0 595 52 10
$btnConnect=New-WizardButton $connectPage 'Connect ChatGPT' 0 66 190 38
$btnControl=New-WizardButton $connectPage 'Open control panel' 205 66 190 38
$connectHint=New-WizardLabel $connectPage 'Connect ChatGPT now, or select Finish and return later. You can also manage DeskSom from the Start menu or tray icon.' 0 119 590 55 9

$footer=New-Object Windows.Forms.Label
$footer.BorderStyle='Fixed3D'
$footer.Location=[Drawing.Point]::new(24,329)
$footer.Size=[Drawing.Size]::new(600,2)
$form.Controls.Add($footer)
$btnBack=New-WizardButton $form '< Back' 265 347 105 34
$btnNext=New-WizardButton $form 'Next >' 383 347 113 34
$btnClose=New-WizardButton $form 'Cancel' 509 347 115 34
$form.AcceptButton=$btnNext
$form.CancelButton=$btnClose
$btnConnect.Enabled=$false
$btnControl.Enabled=$false

function Show-Page([int]$number) {
 if($number -lt 1 -or $number -gt 3){throw 'Invalid setup page.'}
 $script:page=$number
 for($i=0;$i -lt $pages.Count;$i++){$pages[$i].Visible=($i -eq ($number-1))}
 $stepIndicator.Text='Step '+$number+' of 3'
 $pageTitle.Text=@('Choose a folder ChatGPT can access','Review and install DeskSom','Connect ChatGPT')[$number-1]
 $btnBack.Enabled=($number -gt 1 -and -not $script:running -and -not $script:installed)
 $btnBack.Location=if($number -eq 3){[Drawing.Point]::new(383,347)}else{[Drawing.Point]::new(265,347)}
 $btnNext.Visible=($number -ne 3)
 $btnClose.Text=if($number -eq 3){'Finish'}else{'Cancel'}
 $form.AcceptButton=if($number -eq 3){$btnClose}else{$btnNext}
 $btnNext.Text=if($number -eq 1){'Next >'}elseif($number -eq 2){
   if($script:installed){'Next >'}else{'Install DeskSom'}
 }else{'Finish'}
 $btnNext.Enabled=(-not $script:running -and $script:checksReady)
 if($number -eq 3){$btnNext.Enabled=$true}
 if($number -eq 2 -and $PreviewOnly){$btnNext.Text='Next >';$btnNext.Enabled=$true}
 if($number -eq 2 -and -not $PreviewOnly -and -not $script:installed -and -not $script:ready){
  $btnNext.Enabled=$false
 }
 $btnConnect.Enabled=$script:installed
 $btnControl.Enabled=$script:installed
 if($PreviewOnly){
  $connectHint.Text='These actions become available after installation. This preview creates no service or ChatGPT connection.'
 }else{
  $connectHint.Text='Connect ChatGPT now, or select Finish and return later. You can manage DeskSom from the Start menu or tray icon.'
 }
}
function Review-Prerequisites {
 $script:ready=Check-Prerequisites
 if(-not $script:ready){
  $overview.Text='DeskSom needs a few Windows components before installation.'
  $missing=@()
  if(-not $script:pwshOK){$missing+='PowerShell 7.4+'}
  if(-not $script:nodeOK){$missing+='Node.js 22+'}
  $status.Text='Missing: '+($missing -join ' and ')+'. Use the prerequisite button below.'
  $prereq.Visible=$true
 }else{
  $prereq.Visible=$false
  if($script:reviewSummary){$overview.Text=$script:reviewSummary}
  if(-not $script:installed){$status.Text='Ready to install. Your folder and permissions will be confirmed first.'}
 }
 return $script:ready
}
$prereq=New-WizardButton $summaryPage 'Install prerequisites' 350 71 235 36
$prereq.Visible=$false
function Load-ExistingPlan {
 $script:checksReady=$true
 [void](Review-Prerequisites)
 if(Test-Path -LiteralPath $planFile){
  $script:plan=Get-Content -LiteralPath $planFile -Raw -Encoding UTF8|ConvertFrom-Json
  if($script:plan.instance -cne $Instance -or $script:plan.port -ne $Port){
   throw 'An existing setup plan belongs to a different instance or port. It was not changed.'
  }
  $folder.Text=$script:plan.allowedDirectories[0]
  $folder.ReadOnly=$true;$browse.Text='Change folder...'
  $stateFile=Join-Path $script:plan.stateRoot 'install.json'
  if(Test-Path -LiteralPath $stateFile){
   $saved=Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8|ConvertFrom-Json
   if($saved.phase -in @('LOCAL_READY','TUNNEL_READY','STOPPED')){
    $script:installed=$true
    $statusConnect.Text=if($saved.phase -eq 'STOPPED'){
      'DeskSom was installed and deliberately stopped. You can manage it in the control panel.'
    }else{'DeskSom is installed. You can connect ChatGPT now or finish later.'}
    Show-Page 3
    return
   }
   $status.Text='Existing installation activity found. DeskSom will inspect its receipts before continuing.'
  }else{$browse.Enabled=$true}
 }
 Show-Page 1
}
$browse.Add_Click({
 try{
  $dialog=New-Object Windows.Forms.FolderBrowserDialog
  $dialog.Description='Select a folder that ChatGPT can access'
  $dialog.ShowNewFolderButton=$false
  try{
   if($dialog.ShowDialog($form) -ne [Windows.Forms.DialogResult]::OK){return}
   $picked=$dialog.SelectedPath
   if($script:plan){
    $stateFile=Join-Path $script:plan.stateRoot 'install.json'
    if(Test-Path -LiteralPath $stateFile){throw 'DeskSom is already installed. Use the control panel to change folders.'}
    if($script:plan.sourceRoot -ine $root){throw 'The saved plan belongs to another release. It was preserved.'}
    foreach($name in @($script:plan.tasks.local,$script:plan.tasks.tunnel)){
     if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){throw 'An owned service task exists. The saved plan was not changed.'}
    }
    foreach($location in @($script:plan.installRoot,$script:plan.stateRoot)){
     if((Test-Path -LiteralPath $location) -and @(Get-ChildItem -LiteralPath $location -Force).Count){
      throw 'The installation directory is not empty. The saved plan was preserved.'
     }
    }
    if([Windows.Forms.MessageBox]::Show($form,
      'Discard the unused setup plan and choose another folder? Your files will remain untouched.',
      'Change initial folder','YesNo','Question') -ne [Windows.Forms.DialogResult]::Yes){return}
    Remove-Item -LiteralPath $planFile -Force -ErrorAction Stop
    $script:plan=$null
   }
   $folder.ReadOnly=$false;$folder.Text=$picked
  }finally{$dialog.Dispose()}
 }catch{Report $_.Exception.Message $true}
})
$btnBack.Add_Click({
 if($script:running -or $script:installed){return}
 if($script:page -gt 1){Show-Page ($script:page-1)}
})
$btnClose.Add_Click({$form.Close()})

$btnNext.Add_Click({
 try{
  if($script:running){return}
  if($script:page -eq 1){
   $picked=$folder.Text.Trim().Trim('"')
   if(-not(Test-Path -LiteralPath $picked -PathType Container)){throw 'Choose an existing folder before continuing.'}
   $script:reviewSummary='Chosen folder: '+$picked+[Environment]::NewLine+
     'Starts automatically when you sign in to Windows.'+[Environment]::NewLine+
     'Important: Terminal commands have your Windows-account permissions.'
   $overview.Text=$script:reviewSummary
   if($PreviewOnly){$status.Text='Visual preview only; no software will be installed.';$prereq.Visible=$false}else{[void](Review-Prerequisites)}
   Show-Page 2
   return
  }
  if($script:page -eq 3){$form.Close();return}
  if($PreviewOnly){$statusConnect.Text='In the real installer, DeskSom will be ready to connect to ChatGPT.';Show-Page 3;return}
  if($script:installed){Show-Page 3;return}
  if(-not(Check-Prerequisites)){
   [void](Review-Prerequisites)
   throw 'Install the missing prerequisites first, then reopen this setup window.'
  }
  [void][IO.Directory]::CreateDirectory($onboarding)
  if(-not $script:plan){
   $selected=$folder.Text.Trim().Trim('"')
   if(-not(Test-Path -LiteralPath $selected -PathType Container)){throw 'The selected folder no longer exists.'}
   $request=Join-Path $onboarding ($Instance+'-request-'+[Guid]::NewGuid().ToString('N')+'.json')
   @{instance=$Instance;allowedDirectories=@([IO.Path]::GetFullPath($selected));port=$Port}|
     ConvertTo-Json -Depth 5|Set-Content -LiteralPath $request -Encoding UTF8
   $preflight=Invoke-DeskSom @('plan','--spec',$request,'--out',$planFile)
   $script:plan=$preflight.plan
  }
  $p=$script:plan
  $warning='DeskSom can execute terminal commands with your full Windows-user permissions.'+
    [Environment]::NewLine+[Environment]::NewLine+
    'Folder: '+($p.allowedDirectories -join '; ')+[Environment]::NewLine+
    'Private state: '+$p.stateRoot+[Environment]::NewLine+
    'Local port: '+$p.port+[Environment]::NewLine+
    [Environment]::NewLine+
    'The folder list limits file tools, not terminal commands. Keep the connection private.'+
    [Environment]::NewLine+[Environment]::NewLine+'Install DeskSom with this access?'
  $approval=[Windows.Forms.MessageBox]::Show($form,$warning,'Approve DeskSom installation',
    [Windows.Forms.MessageBoxButtons]::YesNo,[Windows.Forms.MessageBoxIcon]::Warning)
  if($approval -ne [Windows.Forms.DialogResult]::Yes){return}
  $nonce=[Guid]::NewGuid().ToString('N')
  $script:stdout=Join-Path $onboarding ($Instance+'-install-'+$nonce+'.json')
  $script:stderr=Join-Path $onboarding ($Instance+'-install-'+$nonce+'.stderr')
  $cli=Join-Path $root 'scripts\cli.mjs'
  $arguments=@(('"' + $cli + '"'),'install','--plan',('"' + $planFile + '"'),
    '--approve',$p.planSha256,'--accept-shell-access','--json')
  $script:running=Start-Process -FilePath $script:node -ArgumentList $arguments -PassThru -WindowStyle Hidden -RedirectStandardOutput $script:stdout -RedirectStandardError $script:stderr
  $status.Text='Installing verified dependencies and testing DeskSom. This can take several minutes.'
  $progress.Style='Marquee'
  $btnBack.Enabled=$false;$btnNext.Enabled=$false;$btnClose.Text='Close setup'
  $folder.ReadOnly=$true;$browse.Enabled=$false
  $timer.Start()
 }catch{Report $_.Exception.Message $true}
})
$timer=New-Object Windows.Forms.Timer
$timer.Interval=750
$timer.Add_Tick({
 try{
  if(-not $script:running){$timer.Stop();return}
  $script:running.Refresh()
  if(-not $script:running.HasExited){return}
  $timer.Stop();$progress.Style='Blocks'
  $code=$script:running.ExitCode
  $script:running.Dispose();$script:running=$null
  $result=$null
  try{$result=Get-Content -LiteralPath $script:stdout -Raw -Encoding UTF8|ConvertFrom-Json}catch{}
  # Windows PowerShell 5.1 may report a null ExitCode from Start-Process
  # even after HasExited, despite a successful JSON result. Confirm the
  # authenticated, source-bound installed status; do not replay install.
  $confirmed=$false;$statusProblem=$null
  if(Test-DeskSomInstallReceipt $result){
   $status.Text='Checking that the installed service is healthy...'
   try{
    $health=Invoke-DeskSom @('status','--state',$script:plan.stateRoot)
    $confirmed=Test-DeskSomInstallCompletion $result $health $script:plan
   }catch{$statusProblem=$_.Exception.Message}
  }
  if(-not $confirmed){
   $status.Text='Setup needs attention. Existing receipts were preserved.'
   Show-Page 2
   $detail=Get-DeskSomInstallIssue $result 'The installation result was not confirmed. Inspect the saved local status before trying again.'
   if($statusProblem){$detail+=' Read-only service verification: '+$statusProblem}
   Report $detail $true
   return
  }
  $script:installed=$true
  $statusConnect.Text='DeskSom is installed and locally verified. It starts when you sign in to Windows.'
  Show-Page 3
  try{[void](Invoke-DeskSom @('tray','--action','launch','--state',$script:plan.stateRoot))}catch{}
 }catch{$timer.Stop();$progress.Style='Blocks';Report $_.Exception.Message $true}
})

$prereq.Add_Click({
 try{
  if(Check-Prerequisites){[void](Review-Prerequisites);Show-Page 2;return}
  $winget=Get-Command winget.exe -ErrorAction SilentlyContinue
  if(-not $winget){throw 'Windows Package Manager is unavailable. Use docs/PREREQUISITES.md.'}
  $needed=@()
  if(-not $script:pwshOK){$needed+='Microsoft.PowerShell'}
  if(-not $script:nodeOK){$needed+='OpenJS.NodeJS.LTS'}
  $message='Install these official Windows components?'+[Environment]::NewLine+($needed -join ', ')+
    [Environment]::NewLine+'Windows may request your approval.'
  if([Windows.Forms.MessageBox]::Show($form,$message,'Install requirements','YesNo','Question') -ne [Windows.Forms.DialogResult]::Yes){return}
  $installer=Join-Path $root 'scripts\Install-Prerequisites.ps1'
  Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-NoExit','-File',('"' + $installer + '"'))|Out-Null
  $status.Text='Finish installing the prerequisites, then reopen DeskSom setup to refresh Windows PATH.'
 }catch{Report $_.Exception.Message $true}
})
$btnConnect.Add_Click({
 try{
  if(-not $script:installed){throw 'Complete the local installation first.'}
  $config=Join-Path $root 'scripts\Configure-Tunnel.ps1'
  $arguments=@('-NoProfile','-STA','-File',('"' + $config + '"'),'-StateRoot',
    ('"' + $script:plan.stateRoot + '"'),'-Graphical','-OpenSettings')
  Start-Process -FilePath $script:pwsh -ArgumentList $arguments|Out-Null
  $statusConnect.Text='The private connection assistant opened. You can finish it later without reinstalling.'
 }catch{Report $_.Exception.Message $true}
})
$btnControl.Add_Click({
 try{
  if(-not $script:installed){throw 'Complete the local installation first.'}
  $p=Join-Path $root 'scripts\ControlPanel.ps1'
  $state=Join-Path $script:plan.stateRoot 'install.json'
  Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-STA','-File',('"' + $p + '"'),
    '-StateFile',('"' + $state + '"'))|Out-Null
 }catch{Report $_.Exception.Message $true}
})
$form.Add_Shown({
 try{
  Check-Release
  if($PreviewOnly){
   $script:checksReady=$true;$script:ready=$true
   if($PreviewFolder){$folder.Text=$PreviewFolder}
   Show-Page 1
   return
  }
  Load-ExistingPlan
 }catch{
  $script:checksReady=$false
  $btnNext.Enabled=$false
  Report $_.Exception.Message $true
 }
})
$form.Add_FormClosing({
 if($script:running){
  $message='Installation is still running. Closing the wizard will not stop or undo it. Close anyway?'
  if([Windows.Forms.MessageBox]::Show($form,$message,'DeskSom installation in progress',
    [Windows.Forms.MessageBoxButtons]::YesNo,[Windows.Forms.MessageBoxIcon]::Warning) -ne [Windows.Forms.DialogResult]::Yes){
   $_.Cancel=$true
  }
 }
})
if($script:uiScale -ne 1.0){$form.Scale([Drawing.SizeF]::new($script:uiScale,$script:uiScale))}
if($StartupCheck){
  # Exercise exactly the first-run initialization route that fires on Form.Shown.
  # Does not show a window, plan files, install any service, or open an account connection.
  Check-Release
  Load-ExistingPlan
  if(-not $script:checksReady -or $script:page -ne 1 -or $script:installed){
    throw 'Startup failed the expected fresh-install state. Inspect the chosen instance and existing state before retrying.'
  }
  [ordered]@{schemaVersion='desksom.gui-startup/v1';result='PASS';instance=$Instance;page=$script:page;
    allowedToProceed=$btnNext.Enabled;initialSummaryInitialized=($null -ne $script:reviewSummary);
    noInstallerStarted=(-not $script:running);noInstallationPerformed=$true;sourceVerified=$true
  } | ConvertTo-Json -Compress
}elseif($LayoutCheck){
  $controls=@($brand,$stepIndicator,$divider,$pageTitle,$footer,$btnBack,$btnNext,$btnClose)+@($pages)
  $within=@($controls|Where-Object {$_.Left -lt 0 -or $_.Top -lt 0 -or $_.Right -gt $form.ClientSize.Width -or $_.Bottom -gt $form.ClientSize.Height})
  $badChildren=0
  foreach($page in $pages){
    foreach($control in $page.Controls){
      if($control.Left -lt 0 -or $control.Top -lt 0 -or $control.Right -gt $page.ClientSize.Width -or $control.Bottom -gt $page.ClientSize.Height){$badChildren++}
    }
  }
  $titles=@()
  foreach($n in @(1,2,3)){
    Show-Page $n
    $titles+=@{number=$n;title=$pageTitle.Text;nextButton=if($n -eq 3){'HIDDEN'}else{$btnNext.Text};closeButton=$btnClose.Text;activePage=$script:page}
  }
  Show-Page 1
  $screen=[Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $bounds=[ordered]@{windowWidth=$form.Width;windowHeight=$form.Height;availableWidth=$screen.Width;availableHeight=$screen.Height;
    footerButtonsEnd=$btnClose.Bottom;clientHeight=$form.ClientSize.Height;pageCount=$pages.Count;
    offscreenControls=$within.Count;offscreenPageControls=$badChildren;pages=$titles}
  if($within.Count -or $badChildren -or $form.Width -gt $screen.Width -or $form.Height -gt $screen.Height){throw ('Layout does not fit current display: '+($bounds|ConvertTo-Json -Compress -Depth 6))}
  $bounds|ConvertTo-Json -Compress -Depth 6
}else{
  [void]$form.ShowDialog()
}
$timer.Stop();$timer.Dispose();$form.Dispose()
