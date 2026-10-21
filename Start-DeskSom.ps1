#requires -Version 5.1
<# Interactive owner entry point. An AI can instead use scripts/Preflight.ps1. #>
[CmdletBinding()]
param([ValidatePattern('^[a-z][a-z0-9-]{0,23}$')][string]$Instance='default')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root=$PSScriptRoot
function Find-App([string]$Name,[string[]]$Known){
  foreach($p in $Known){if($p -and (Test-Path -LiteralPath $p -PathType Leaf)){return $p}}
  $cmd=Get-Command $Name -ErrorAction SilentlyContinue;if($cmd){return $cmd.Source};return $null
}
function Json-CLI([string[]]$Arguments){
  $lines=& $script:node (Join-Path $root 'scripts\cli.mjs') @Arguments
  $rc=$LASTEXITCODE
  try{$result=($lines -join "`n")|ConvertFrom-Json}catch{throw 'The installer did not return a valid result. No success is claimed.'}
  if($rc -ne 0 -or -not $result.operationOk){
    if($result.PSObject.Properties.Name -contains 'error'){Write-Host $result.error.message;Write-Host $result.error.nextAction}
    throw 'The requested step is blocked. Preserve the existing files and ask ChatGPT to interpret the reported condition.'
  }
  return $result
}
Write-Host 'DeskSom setup'
Write-Host 'This installer gives a private ChatGPT connection file and terminal access under your Windows account.'
Write-Host 'It is not a sandbox. Use only a release you trust, and keep the connection private.'
Write-Host 'No subscription will be bought, no API key will be requested in chat, and no public port will be opened.'
if((Read-Host 'Type TRUST to confirm you chose and trust this downloaded source') -cne 'TRUST'){Write-Host 'Cancelled.';exit 10}
# Check the release without needing Node.js first. A checksum is not a publisher signature.
$manifestFile=Join-Path $root 'release-manifest.json'
if(-not(Test-Path -LiteralPath $manifestFile)){throw 'Release manifest is missing. Use a prepared release archive, not an unsealed work-in-progress checkout.'}
$manifest=Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8|ConvertFrom-Json
foreach($entry in $manifest.files){
  if($entry.path -match '(^/|\\|(^|/)\.\.(/|$)|:)'){throw 'Unsafe source manifest path.'}
  $file=Join-Path $root $entry.path
  if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.sha256){throw 'Source integrity check failed. Do not ignore this error.'}
}
$pwsh=Find-App 'pwsh.exe' @((Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\pwsh.exe'),(Join-Path $env:ProgramFiles 'PowerShell\7\pwsh.exe'))
$script:node=Find-App 'node.exe' @((Join-Path $env:ProgramFiles 'nodejs\node.exe'))
$needPwsh=(-not $pwsh);$needNode=(-not $script:node)
if($pwsh){try{$v=& $pwsh -NoProfile -Command '$PSVersionTable.PSVersion.ToString()';$needPwsh=([Version]($v -join '') -lt [Version]'7.4.0')}catch{$needPwsh=$true}}
if($script:node){try{$v=& $script:node --version;$needNode=([version]$v.TrimStart('v') -lt [version]'22.12.0')}catch{$needNode=$true}}
if($needPwsh -or $needNode){
  Write-Host 'Missing or old prerequisites:'
  if($needPwsh){Write-Host '  PowerShell 7.4 or newer (Microsoft.PowerShell)'}
  if($needNode){Write-Host '  Node.js 22.12 or newer (OpenJS.NodeJS.LTS)'}
  Write-Host 'WinGet may display licenses or a Windows administrator confirmation. You must approve those yourself.'
  if((Read-Host 'Type PREREQUISITES to ask WinGet to install the missing tools') -cne 'PREREQUISITES'){Write-Host 'See docs/PREREQUISITES.md for manual installation.';exit 10}
  $winget=Get-Command winget.exe -ErrorAction SilentlyContinue
  if(-not $winget){throw 'WinGet is missing. Use docs/PREREQUISITES.md. No package-manager bootstrap will be run automatically.'}
  $packages=@();if($needPwsh){$packages+='Microsoft.PowerShell'};if($needNode){$packages+='OpenJS.NodeJS.LTS'}
  foreach($id in $packages){
    & $winget.Source install --id $id --exact --source winget
    if($LASTEXITCODE -ne 0){throw 'The prerequisite installer did not report success. It may need sign-in or restart. Inspect the result before repeating it.'}
  }
  Write-Host 'Prerequisite installation finished. Close this window, then open Start-DeskSom.cmd again to refresh PATH.'
  exit 10
}
$env:DESKSOM_PWSH=$pwsh
$onboarding=Join-Path $env:LOCALAPPDATA 'DeskSom-Onboarding';[void][IO.Directory]::CreateDirectory($onboarding)
$planFile=Join-Path $onboarding ($Instance+'-plan.json')
if(Test-Path -LiteralPath $planFile){
  $plan=Get-Content -LiteralPath $planFile -Raw -Encoding UTF8|ConvertFrom-Json
  Write-Host 'A previous installation plan exists. This run will inspect and resume it, never overwrite it.'
}else{
  $folder=(Read-Host 'Paste the full path of an existing folder ChatGPT may work in (for example your project folder)').Trim().Trim('"')
  if(-not(Test-Path -LiteralPath $folder -PathType Container)){throw 'The folder does not exist. Choose an existing work folder; no files were changed.'}
  $specFile=Join-Path $onboarding ($Instance+'-request-'+[Guid]::NewGuid().ToString('N')+'.json')
  @{instance=$Instance;allowedDirectories=@([IO.Path]::GetFullPath($folder))}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $specFile -Encoding UTF8
  $result=Json-CLI @('plan','--spec',$specFile,'--out',$planFile,'--json');$plan=$result.plan
}
Write-Host ('Source version: '+$plan.version)
Write-Host ('Installed runtime: '+$plan.installRoot)
Write-Host ('Private state: '+$plan.stateRoot)
Write-Host ('File-tool folders: '+($plan.allowedDirectories -join '; '))
Write-Host ('Local TCP port: '+$plan.port)
Write-Host 'Terminal tools retain your full Windows-user permissions outside the file-tool folders.'
Write-Host 'Setup downloads pinned dependencies and runs disposable local verification commands.'
if((Read-Host 'Type INSTALL to approve this plan and acknowledge full-user shell access') -cne 'INSTALL'){Write-Host 'Cancelled. The plan is retained for a later attempt.';exit 10}
Write-Host 'Preparing and testing the service. This can take several minutes. Closing the window is not a rollback.'
$result=Json-CLI @('install','--plan',$planFile,'--approve',$plan.planSha256,'--accept-shell-access','--json')
Write-Host $result.status
Write-Host 'The local service is installed. A working ChatGPT connection still requires your own tunnel and a real tool call.'
Write-Host 'DeskSom is scheduled to start at your Windows sign-in and recover from ordinary process crashes.'
Write-Host 'The tray icon is installed for the next sign-in; you can open it now.'
if((Read-Host 'Type TRAY to start the DeskSom tray icon now, or press Enter to continue') -ceq 'TRAY'){
  $trayResult=Json-CLI @('tray','--action','launch','--state',$plan.stateRoot,'--json')
  Write-Host ('Tray: '+$trayResult.status)
}
if((Read-Host 'Type CONNECT to continue with the owner-only tunnel prompt, or press Enter to stop here') -ceq 'CONNECT'){
  & $pwsh -NoProfile -File (Join-Path $root 'scripts\Configure-Tunnel.ps1') -StateRoot $plan.stateRoot -OpenSettings
  exit $LASTEXITCODE
}
Write-Host ('Resume tunnel setup later with scripts\Configure-Tunnel.ps1 -StateRoot "'+$plan.stateRoot+'"')
