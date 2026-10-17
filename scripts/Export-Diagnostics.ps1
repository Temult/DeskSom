#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][string]$StateRoot,[Parameter(Mandatory)][string]$OutFile)
& (Join-Path (Split-Path -Parent $PSScriptRoot) 'DeskSom.ps1') export-diagnostics --state $StateRoot --out $OutFile --json
exit $LASTEXITCODE
