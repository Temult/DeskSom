#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][string]$StateRoot,[switch]$Deep,[switch]$Exercise,[switch]$Json)
$argsList=@('verify','--state',$StateRoot,'--json')
if($Deep){$argsList+='--deep'}
if($Exercise){$argsList+='--exercise'}
& (Join-Path (Split-Path -Parent $PSScriptRoot) 'DeskSom.ps1') @argsList
exit $LASTEXITCODE
