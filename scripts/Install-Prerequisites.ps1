#requires -Version 5.1
# Opened only after the Windows user approves prerequisite installation in the graphical setup.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$winget=Get-Command winget.exe -ErrorAction Stop
$needed=@()
$pwsh=Get-Command pwsh.exe -ErrorAction SilentlyContinue
$node=Get-Command node.exe -ErrorAction SilentlyContinue
if(-not $pwsh){$needed+='Microsoft.PowerShell'}else{
 try{$v=(& $pwsh.Source -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'|Select-Object -Last 1);if([version]$v -lt [version]'7.4'){$needed+='Microsoft.PowerShell'}}catch{$needed+='Microsoft.PowerShell'}
}
if(-not $node){$needed+='OpenJS.NodeJS.LTS'}else{
 try{$v=(& $node.Source --version).TrimStart('v').Split('.')[0];if([int]$v -lt 22){$needed+='OpenJS.NodeJS.LTS'}}catch{$needed+='OpenJS.NodeJS.LTS'}
}
if(-not $needed.Count){Write-Host 'All prerequisites are installed. Close this window and reopen DeskSom Setup.';return}
foreach($id in $needed){
 Write-Host ('Installing official WinGet package: '+$id)
 & $winget.Source install --id $id --exact --source winget
 if($LASTEXITCODE -ne 0){throw ('Windows did not confirm installation of '+$id+'. Inspect its result before continuing.')}
}
Write-Host 'Prerequisites installed. Close this window, then reopen DeskSom Setup.'
