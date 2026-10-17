#requires -Version 5.1
# A stable Windows PowerShell entry point locates PowerShell 7 at each launch.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$StateFile,[Parameter(Mandatory)][ValidateSet('local','tunnel')][string]$Kind)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$state=Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8|ConvertFrom-Json
if($state.plan.binding.host -cne [Environment]::MachineName){throw 'DeskSom host mismatch.'}
if($state.plan.binding.sid -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value){throw 'DeskSom user mismatch.'}
$paths=@((Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\pwsh.exe'),(Join-Path $env:ProgramFiles 'PowerShell\7\pwsh.exe'),$state.environment.pwsh)
$pwsh=$null
foreach($p in $paths){if($p -and (Test-Path -LiteralPath $p -PathType Leaf)){$pwsh=$p;break}}
if(-not $pwsh){throw 'PowerShell 7 is missing. Repair prerequisites; do not reuse a removed WindowsApps version path.'}
$script=Join-Path $state.runtimeRoot 'scripts\Run-Service.ps1'
$manifestPath=Join-Path $state.runtimeRoot 'release-manifest.json'
if((Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $state.releaseManifestSha256){throw 'DeskSom release manifest changed.'}
$manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8|ConvertFrom-Json
$entry=@($manifest.files|Where-Object path -ceq 'scripts/Run-Service.ps1')
if($entry.Count -ne 1 -or (Get-FileHash -LiteralPath $script).Hash.ToLowerInvariant() -cne $entry[0].sha256){throw 'DeskSom runner source changed.'}
& $pwsh -NoProfile -NonInteractive -WindowStyle Hidden -File $script -StateFile $StateFile -Kind $Kind
exit $LASTEXITCODE
