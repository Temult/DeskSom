#requires -Version 7.4
[CmdletBinding()]
param([Parameter(Mandatory)][string]$StateFile,[Parameter(Mandatory)][ValidateSet('local','tunnel')][string]$Kind)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'WindowsHost.ps1') -Action Library
$state=Ds-State $StateFile -CheckSource
if($state.operatorStopped){Ds-Fail 'OWNER_STOPPED' 'The owner stopped this service.'}
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){Ds-Fail 'ELEVATED_SESSION' 'DeskSom services must not run elevated.'}
$policy=Ds-ReadJson (Join-Path $state.runtimeRoot 'release-policy.json')
$settings=Ds-ReadJson (Join-Path $state.plan.stateRoot 'settings.json')
if($settings.installationId -cne $state.installationId -or $settings.sourceFingerprint -cne $state.plan.sourceFingerprint -or
   $settings.port -ne $state.plan.port -or $settings.expectedHost -cne $state.plan.binding.host -or
   $settings.instance -cne $state.plan.instance -or $settings.stateDir -ine $state.plan.stateRoot -or
   $settings.workDir -ine $state.plan.allowedDirectories[0] -or
   (($settings.allowedDirectories|ConvertTo-Json -Compress) -cne ($state.plan.allowedDirectories|ConvertTo-Json -Compress))){Ds-Fail 'SETTINGS_DRIFT' 'Runtime settings changed.'}
$psi=[Diagnostics.ProcessStartInfo]::new();$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true
$psi.WorkingDirectory=$state.runtimeRoot;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
foreach($key in @($psi.Environment.Keys)){
  if($key -match '^(OPENAI_|CONTROL_PLANE_|TUNNEL_CLIENT_|DESKSOM_|MCP_|CLOUDFLARED_|NODE_OPTIONS$)'){$psi.Environment.Remove($key)|Out-Null}
}
if($Kind -eq 'local'){
  $psi.FileName=$state.environment.node
  $psi.ArgumentList.Add((Join-Path $state.runtimeRoot 'broker.mjs'))
  $psi.ArgumentList.Add('--config');$psi.ArgumentList.Add((Join-Path $state.plan.stateRoot 'settings.json'))
  $psi.Environment['DESKSOM_HTTP_TOKEN']=Ds-Secret (Join-Path $state.plan.stateRoot 'http-token.dpapi')
  $psi.Environment['DESKTOP_COMMANDER_DISABLE_TELEMETRY']='1'
}else{
  if(-not $state.credentialsConfigured){Ds-Fail 'CREDENTIALS_REQUIRED' 'The tunnel runtime key has not been configured.'}
  $connection=Ds-ReadJson (Join-Path $state.plan.stateRoot 'connection.json')
  if($connection.installationId -cne $state.installationId -or $connection.status -cne 'CONFIGURED'){Ds-Fail 'CREDENTIAL_BINDING' 'Tunnel configuration belongs to another installation or is incomplete.'}
  $deadline=[DateTime]::UtcNow.AddSeconds(100);$ready=$false
  while([DateTime]::UtcNow -lt $deadline){if(Ds-Identity (Ds-Probe $state) $state){$ready=$true;break};Start-Sleep -Seconds 2}
  if(-not $ready){Ds-Fail 'LOCAL_NOT_READY' 'The local service must be ready before starting the tunnel.'}
  $psi.FileName=Join-Path $state.runtimeRoot 'bin\tunnel-client.exe'
  if((Get-FileHash -LiteralPath $psi.FileName).Hash.ToLowerInvariant() -cne $policy.tunnelExeSha256){Ds-Fail 'TUNNEL_BINARY_DRIFT' 'Tunnel binary differs from its pinned hash.'}
  $psi.Environment['CONTROL_PLANE_API_KEY']=Ds-Secret (Join-Path $state.plan.stateRoot 'control-plane-api-key.dpapi')
  $psi.Environment['DESKSOM_MCP_AUTH']='Bearer '+(Ds-Secret (Join-Path $state.plan.stateRoot 'http-token.dpapi'))
  $psi.Environment['XDG_CONFIG_HOME']=Join-Path $state.plan.stateRoot 'tunnel-config'
  $psi.Environment['XDG_STATE_HOME']=Join-Path $state.plan.stateRoot 'tunnel-state'
  $config=Join-Path $state.plan.stateRoot 'isolated-tunnel.yaml'
  if(-not(Test-Path -LiteralPath $config)){[IO.File]::WriteAllText($config,"{}",[Text.UTF8Encoding]::new($false))}
  $arguments=@('run','--config',$config,'--control-plane.base-url','https://api.openai.com','--control-plane.tunnel-id',$connection.tunnelId,
    '--control-plane.api-key','env:CONTROL_PLANE_API_KEY','--mcp.server-url',('http://127.0.0.1:'+$state.plan.port+'/mcp'),
    '--mcp.extra-headers','Authorization: env:DESKSOM_MCP_AUTH','--mcp.discovery-extra-headers','Authorization: env:DESKSOM_MCP_AUTH',
    '--health.listen-addr','127.0.0.1:0','--health.url-file',(Join-Path $state.plan.stateRoot 'tunnel-health-url.txt'),
    '--log.file',(Join-Path $state.plan.stateRoot 'logs\tunnel-client.log'))
  foreach($arg in $arguments){$psi.ArgumentList.Add($arg)}
}
$logs=Join-Path $state.plan.stateRoot 'logs';[void][IO.Directory]::CreateDirectory($logs)
$logPath=Join-Path $logs ($Kind+'-service.log')
if(Test-Path -LiteralPath $logPath){if((Get-Item -LiteralPath $logPath).Length -gt 10485760){[IO.File]::Move($logPath,($logPath+'.previous'),$true)}}
$child=[Diagnostics.Process]::new();$child.StartInfo=$psi
try{
  [void]$child.Start()
  # Continuous async drain into a bounded in-memory tail would hide workload diagnostics.
  # Stream privately to disk; logs are excluded from all public diagnostic exports.
  $outFile=[IO.File]::Open($logPath,[IO.FileMode]::Append,[IO.FileAccess]::Write,[IO.FileShare]::ReadWrite)
  $errorFile=[IO.File]::Open(($logPath+'.stderr'),[IO.FileMode]::Append,[IO.FileAccess]::Write,[IO.FileShare]::ReadWrite)
  try{
    $outTask=$child.StandardOutput.BaseStream.CopyToAsync($outFile)
    $errorTask=$child.StandardError.BaseStream.CopyToAsync($errorFile)
    Ds-WriteJson (Join-Path $state.plan.stateRoot ('service-'+$Kind+'.json')) @{pid=$child.Id;startedAt=$child.StartTime.ToUniversalTime().ToString('o');kind=$Kind;installationId=$state.installationId}
    $child.WaitForExit();[Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($outTask,$errorTask))
    $exitCode=$child.ExitCode
  }finally{$outFile.Dispose();$errorFile.Dispose()}
}finally{
  foreach($key in @('DESKSOM_HTTP_TOKEN','CONTROL_PLANE_API_KEY','DESKSOM_MCP_AUTH')){[void]$psi.Environment.Remove($key)}
  $child.Dispose()
}
exit $exitCode
