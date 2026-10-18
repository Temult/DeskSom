#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][string]$StateFile)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'WinForms-Dpi.ps1')
$script:uiScale=Enable-DeskSomHighDpi
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$state=Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8|ConvertFrom-Json
if($state.plan.binding.host -cne [Environment]::MachineName -or
   $state.plan.binding.sid -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value){
 throw 'DeskSom tray host or user does not match this installation.'
}
$hash=[Convert]::ToBase64String([Security.Cryptography.SHA256]::Create().ComputeHash(
  [Text.Encoding]::UTF8.GetBytes($state.plan.stateRoot.ToLowerInvariant()))).Replace('/','_').Replace('+','-').TrimEnd('=')
$mutex=[Threading.Mutex]::new($false,('Local\DeskSom-Tray-'+$hash))
$timer=$null;$icon=$null;$menu=$null
$owned=$false
try{
 try{$owned=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$owned=$true}
 if(-not $owned){return}
 $icon=New-Object Windows.Forms.NotifyIcon
 $icon.Visible=$true
 $icon.Icon=[Drawing.SystemIcons]::Application
 $icon.Text='DeskSom: checking local service'
 $menu=New-Object Windows.Forms.ContextMenuStrip
 $open=$menu.Items.Add('Open DeskSom control panel')
 $folders=$menu.Items.Add('Manage folders...')
 $stats=$menu.Items.Add('Statistics...')
 $settings=$menu.Items.Add('Settings...')
 [void]$menu.Items.Add('-')
 $health=$menu.Items.Add('Checking...')
 $health.Enabled=$false
 [void]$menu.Items.Add('-')
 $exit=$menu.Items.Add('Exit tray icon (service keeps running)')
 $icon.ContextMenuStrip=$menu
 $panel=Join-Path $state.runtimeRoot 'scripts\ControlPanel.ps1'
 function Open-ControlPanel([string]$which){
  if(-not(Test-Path -LiteralPath $panel)){return}
  Start-Process -FilePath $state.environment.windowsPowerShell -ArgumentList @(
   '-NoProfile','-STA','-File',('"'+$panel+'"'),'-StateFile',('"'+$StateFile+'"'),'-Tab',$which
  ) |Out-Null
 }
 $open.Add_Click({Open-ControlPanel 'Overview'})
 $folders.Add_Click({Open-ControlPanel 'Folders'})
 $stats.Add_Click({Open-ControlPanel 'Statistics'})
 $settings.Add_Click({Open-ControlPanel 'Settings'})
 $icon.Add_DoubleClick({Open-ControlPanel 'Overview'})
 $context=New-Object Windows.Forms.ApplicationContext
 $exit.Add_Click({$context.ExitThread()})
 function Refresh-LocalIndicator {
  try {
   $s=Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8|ConvertFrom-Json
   if($s.phase -eq 'TASKS_REMOVED'){$context.ExitThread();return}
   if($s.operatorStopped){
    $icon.Icon=[Drawing.SystemIcons]::Warning
    $icon.Text='DeskSom: stopped by owner'
    $health.Text='Stopped by owner'
    return
   }
   $task=Get-ScheduledTask -TaskName $s.plan.tasks.local -ErrorAction SilentlyContinue
   if($null -eq $task -or $task.State -ne 'Running'){
    $icon.Icon=[Drawing.SystemIcons]::Warning
    $icon.Text='DeskSom: local task not running'
    $health.Text='Local task not running'
    return
   }
   $url='http://127.0.0.1:'+$s.plan.port+'/readyz'
   $status=Invoke-RestMethod -Uri $url -TimeoutSec 2
   if($status.ready){
    $icon.Icon=[Drawing.SystemIcons]::Application
    $icon.Text='DeskSom: local service responding'
    $health.Text='Local service responding'
   }else{
    $icon.Icon=[Drawing.SystemIcons]::Warning
    $icon.Text='DeskSom: local service starting'
    $health.Text='Local service starting'
   }
  }catch{
   $icon.Icon=[Drawing.SystemIcons]::Error
   $icon.Text='DeskSom: local service unavailable'
   $health.Text='Local service unavailable'
  }
 }
 $timer=New-Object Windows.Forms.Timer
 $timer.Interval=60000
 $timer.Add_Tick({Refresh-LocalIndicator})
 $timer.Start()
 Refresh-LocalIndicator
 [Windows.Forms.Application]::Run($context)
}finally{
 if($null -ne $timer){$timer.Stop();$timer.Dispose()}
 if($null -ne $icon){$icon.Visible=$false;$icon.Dispose()}
 if($null -ne $menu){$menu.Dispose()}
 if($owned){$mutex.ReleaseMutex()}
 $mutex.Dispose()
}
