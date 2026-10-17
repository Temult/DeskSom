#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][string]$PlanFile,[Parameter(Mandatory)][string]$ApprovePlanSha256,
  [switch]$AcceptShellAccess,[switch]$PrepareOnly,[switch]$Json)
$argsList=@('install','--plan',$PlanFile,'--approve',$ApprovePlanSha256,'--json')
if($AcceptShellAccess){$argsList+='--accept-shell-access'}
if($PrepareOnly){$argsList+='--prepare-only'}
& (Join-Path $PSScriptRoot 'DeskSom.ps1') @argsList
exit $LASTEXITCODE
