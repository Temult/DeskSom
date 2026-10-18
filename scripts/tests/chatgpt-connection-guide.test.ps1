#requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$guide=Join-Path $root 'ChatGPT-Connection-Guide.ps1'
$wizard=Join-Path (Split-Path -Parent $root) 'Start-DeskSom-GUI.ps1'
$config=Join-Path $root 'Configure-Tunnel.ps1'
$panel=Join-Path $root 'ControlPanel.ps1'
$checks=0
function Require([bool]$condition,[string]$message){
 if(-not $condition){throw $message};$script:checks++
}
$tokens=$null;$errors=$null
[void][System.Management.Automation.Language.Parser]::ParseFile($guide,[ref]$tokens,[ref]$errors)
Require (@($errors).Count -eq 0) 'Guide PowerShell AST failed.'
$source=Get-Content -LiteralPath $guide -Raw -Encoding UTF8
$gui=Get-Content -LiteralPath $wizard -Raw -Encoding UTF8
$cfg=Get-Content -LiteralPath $config -Raw -Encoding UTF8
$ctl=Get-Content -LiteralPath $panel -Raw -Encoding UTF8
$raw=& powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File $guide -LayoutCheck
Require ($LASTEXITCODE -eq 0) 'Actual Windows PowerShell guide layout failed.'
$layout=($raw -join [Environment]::NewLine)|ConvertFrom-Json
Require ($layout.result -ceq 'PASS' -and $layout.steps -eq 6) 'Guide did not show six steps.'
Require (@($layout.clipped).Count -eq 0) 'Guide clipped controls.'
Require ($layout.createdNoPlugin -eq $true) 'Layout check must not create a plugin.'
Require ($source.Contains('https://chatgpt.com/plugins')) 'ChatGPT plugin link missing.'
Require ($source.Contains('Add custom MCP server')) 'Required create step missing.'
Require ($source.Contains('No authentication')) 'ChatGPT-facing authentication guidance missing.'
Require ($source.Contains('Copy tunnel ID')) 'Tunnel selection aid missing.'
Require ($source.Contains('Copy verification message')) 'Identity verification aid missing.'
Require ($source.Contains("Clipboard]::SetText(")) 'Explicit copy action missing.'
Require ($source.Contains('installationId') -and $source.Contains('sourceFingerprint')) 'Association identity binding missing.'
Require (-not $source.Contains('control-plane-api-key.dpapi')) 'Guide may not read API keys.'
Require ($source.Contains('createdNoPlugin=$true')) 'Guide must disclose owner-side plugin creation.'
Require ($cfg.Contains('ChatGPT-Connection-Guide.ps1')) 'Tunnel completion does not launch the guide.'
Require ($gui.Contains('ChatGPT-Connection-Guide.ps1')) 'Wizard lacks resumable guide.'
Require ($ctl.Contains('Finish ChatGPT setup')) 'Control panel lacks setup-resume action.'
Require ($ctl.Contains('ChatGPT-Connection-Guide.ps1')) 'Control panel does not open the guide.'
[ordered]@{schemaVersion='desksom.connection-guide-native/v1';result='PASS';assertions=$checks;layout=$layout.result;noAccountMutation=$true} | ConvertTo-Json -Compress