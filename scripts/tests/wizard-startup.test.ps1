#requires -Version 5.1
# First-use wizard startup check. No window, plan, account token, task, or service is created.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$source=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$gui=Join-Path $source 'Start-DeskSom-GUI.ps1'
if(-not (Test-Path -LiteralPath $gui -PathType Leaf)){throw 'Wizard entry file is absent.'}
$instance='startup'+[Guid]::NewGuid().ToString('N').Substring(0,12)
$state=Join-Path $env:LOCALAPPDATA ('DeskSom-Onboarding\'+$instance+'-plan.json')
if(Test-Path -LiteralPath $state){throw 'Fresh test instance collision.'}
$raw=& powershell.exe -NoProfile -STA -File $gui -Instance $instance -Port 19697 -StartupCheck
$rc=$LASTEXITCODE
try{$result=($raw -join [Environment]::NewLine)|ConvertFrom-Json}catch{throw 'Wizard startup returned no valid status.'}
if($rc -ne 0 -or $result.result -cne 'PASS' -or $result.instance -cne $instance -or
  $result.page -ne 1 -or -not $result.initialSummaryInitialized -or -not $result.allowedToProceed -or
  -not $result.noInstallerStarted -or -not $result.noInstallationPerformed -or -not $result.sourceVerified){
 throw 'First-run GUI initialization failed. Preserve the original error before retrying.'
}
if(Test-Path -LiteralPath $state){throw 'Startup smoke test unexpectedly created an installation plan.'}
@{schemaVersion='desksom.wizard-first-start-test/v1';result='PASS';initializedSummary=$true;
  firstPage=1;readyToContinue=$true;noInstallation=$true;hostProcess='powershell.exe'}|ConvertTo-Json -Compress
