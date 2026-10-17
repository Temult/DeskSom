#requires -Version 7.4
<# Owner-only local prompt. There is intentionally no API-key parameter. #>
[CmdletBinding()]
param([Parameter(Mandatory)][string]$StateRoot,[switch]$OpenSettings)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
& (Join-Path $root 'DeskSom.ps1') guard-configure --state $StateRoot --json
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
. (Join-Path $PSScriptRoot 'WindowsHost.ps1') -Action Library
$stateFile=Join-Path $StateRoot 'install.json'
$mutex=Ds-Mutex $StateRoot;$held=$false
try{
  try{$held=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true}
  if(-not $held){throw 'Another installation operation is active. Wait for it to finish.'}
  $state=Ds-State $stateFile -CheckSource
  if(-not(Ds-Identity (Ds-Probe $state) $state)){throw 'The owned local service must be ready first.'}
  Write-Host 'Use YOUR OpenAI Platform organization and YOUR ChatGPT workspace.'
  Write-Host 'Create or select a private tunnel and review permissions and any applicable charges.'
  Write-Host 'Tunnel administration needs Read + Manage. The runtime and app operator need Read + Use.'
  Write-Host 'Associate the tunnel with the intended ChatGPT workspace as well as its Platform organization.'
  Write-Host 'The next secret is entered only in this local masked prompt. Never paste it into ChatGPT or GitHub.'
  if($OpenSettings){Start-Process 'https://platform.openai.com/settings/organization/tunnels'}
  $connectionFile=Join-Path $StateRoot 'connection.json';$keyFile=Join-Path $StateRoot 'control-plane-api-key.dpapi'
  Ds-CheckPath $connectionFile;Ds-CheckPath $keyFile
  if(Test-Path -LiteralPath $connectionFile){
    $connection=Ds-ReadJson $connectionFile
    if($connection.installationId -cne $state.installationId -or $connection.sourceFingerprint -cne $state.plan.sourceFingerprint){throw 'Existing tunnel configuration belongs to another installation. It was not changed.'}
    Write-Host 'A tunnel association is already saved. Resuming it without replacing the key or tunnel ID.'
  }else{
    if(Test-Path -LiteralPath $keyFile){throw 'A credential exists without an association receipt. Preserve it and investigate; it was not overwritten.'}
    $tunnelId=(Read-Host 'Paste your private tunnel ID').Trim()
    if($tunnelId -cnotmatch '^tunnel_[A-Za-z0-9_]{16,80}$'){throw 'The tunnel ID format is not recognized.'}
    if((Read-Host 'Type CONNECT to confirm the intended organization, workspace and private access') -cne 'CONNECT'){throw 'Cancelled; no credential saved.'}
    $connection=@{schemaVersion='desksom.connection/v1';installationId=$state.installationId;sourceFingerprint=$state.plan.sourceFingerprint;tunnelId=$tunnelId;status='PENDING_KEY';at=[DateTime]::UtcNow.ToString('o')}
    Ds-WriteJson $connectionFile $connection
  }
  if(-not(Test-Path -LiteralPath $keyFile)){
    if($OpenSettings){Start-Process 'https://platform.openai.com/settings/organization/api-keys'}
    $key=Read-Host 'Enter the restricted runtime API key (hidden)' -AsSecureString
    try{if($key.Length -lt 20 -or $key.Length -gt 2048){throw 'The key length is not plausible; nothing was saved.'};Ds-SaveSecret $keyFile $key}finally{$key.Dispose()}
  }
  $connection.status='CONFIGURED';Ds-WriteJson $connectionFile $connection
  $state=Ds-State $stateFile -CheckSource;$state.credentialsConfigured=$true;$state.updatedAt=[DateTime]::UtcNow.ToString('o');Ds-WriteJson $stateFile $state
}finally{if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
& (Join-Path $root 'DeskSom.ps1') enable-tunnel --state $StateRoot --json
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
Write-Host 'The private tunnel is ready for the ChatGPT-side test. Local readiness is not end-to-end proof.'
Write-Host 'In ChatGPT: Plugins > Add custom MCP server > Connection: Tunnel. Select the same tunnel.'
Write-Host 'For this bridge, choose No authentication in that dialog; local bearer authentication remains enabled.'
Write-Host 'Ask ChatGPT to call desksom_status and verify this machine and instance before any real work.'
