#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][string]$StateRoot,[switch]$Apply,
  [ValidateSet('restore-missing-tasks','start-stopped')][string]$Operation,[switch]$Json)
$argsList=@('repair','--state',$StateRoot,'--json')
if($Apply){$argsList+='--apply'}
if($Operation){$argsList+=@('--operation',$Operation)}
& (Join-Path (Split-Path -Parent $PSScriptRoot) 'DeskSom.ps1') @argsList
exit $LASTEXITCODE
