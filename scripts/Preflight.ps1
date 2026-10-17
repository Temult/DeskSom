#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][string]$SpecFile,[string]$OutFile,[switch]$Json)
$argsList=@('plan','--spec',$SpecFile,'--json')
if($OutFile){$argsList+=@('--out',$OutFile)}
& (Join-Path (Split-Path -Parent $PSScriptRoot) 'DeskSom.ps1') @argsList
exit $LASTEXITCODE
