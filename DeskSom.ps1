#requires -Version 5.1
<# A thin agent-friendly entry point. All decisions and receipts come from one CLI. #>
$CliArgs=$args
$ErrorActionPreference='Stop'
$node=Get-Command node.exe -ErrorAction SilentlyContinue
if(-not $node){
  [Console]::Out.WriteLine('{"schemaVersion":"desksom.result/v1","operationOk":false,"setupComplete":false,"status":"BLOCKED","error":{"code":"NODE_MISSING","message":"Node.js is required.","nextAction":"Run Start-DeskSom.cmd or follow docs/PREREQUISITES.md."}}')
  exit 20
}
& $node.Source (Join-Path $PSScriptRoot 'scripts\cli.mjs') @CliArgs
exit $LASTEXITCODE
