#requires -Version 7.4
[CmdletBinding()]
param([ValidateSet('Dispatch','Lock','Library')][string]$Action='Dispatch')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$PSStyle.OutputRendering='PlainText'

function Ds-Fail([string]$Code,[string]$Message) { throw ($Code+'|'+$Message) }
function Ds-ReadJson([string]$Path) { Get-Content -LiteralPath $Path -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable }
function Ds-WriteJson([string]$Path,$Value) {
  $tmp=$Path+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
  [IO.File]::WriteAllText($tmp,($Value|ConvertTo-Json -Depth 30)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
  try {[IO.File]::Move($tmp,$Path,$true)}finally{if(Test-Path -LiteralPath $tmp){Remove-Item -LiteralPath $tmp -Force}}
}
function Ds-CurrentSid { [Security.Principal.WindowsIdentity]::GetCurrent().User.Value }
function Ds-CheckPath([string]$Path) {
  if($Path -notmatch '^[A-Za-z]:[\\/]' -or $Path -match '[\x00-\x1f<>"|?*]'){Ds-Fail 'INVALID_PATH' 'An absolute local Windows path is required.'}
  $p=[IO.Path]::GetFullPath($Path)
  while($p){
    if(Test-Path -LiteralPath $p){$item=Get-Item -LiteralPath $p -Force;if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){Ds-Fail 'LINKED_PATH' 'A path passes through a junction or symlink.'}}
    $parent=[IO.Directory]::GetParent($p);if($null -eq $parent){break};$p=$parent.FullName
  }
}
function Ds-Protect([string]$Directory) {
  Ds-CheckPath $Directory
  if(Test-Path -LiteralPath $Directory){
    $old=Get-Acl -LiteralPath $Directory
    if($old.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne (Ds-CurrentSid)){Ds-Fail 'OWNER_MISMATCH' 'The directory is not owned by the current Windows user.'}
  }else{[void][IO.Directory]::CreateDirectory($Directory)}
  # Modify only the DACL. Reassigning an unchanged owner can require privileges
  # a normal Windows account deliberately does not possess.
  $acl=Get-Acl -LiteralPath $Directory
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl.SetAccessRuleProtection($true,$false)
  foreach($existing in @($acl.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier]))){[void]$acl.RemoveAccessRuleSpecific($existing)}
  foreach($account in @($sid,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){
    $rule=[Security.AccessControl.FileSystemAccessRule]::new($account,'FullControl','ContainerInherit,ObjectInherit','None','Allow');[void]$acl.AddAccessRule($rule)
  }
  $current=Get-Acl -LiteralPath $Directory
  $rules=@($current.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
  $valid=$current.AreAccessRulesProtected -and $rules.Count -eq 2
  foreach($rule in $rules){if($rule.IdentityReference.Value -notin @($sid.Value,'S-1-5-18') -or $rule.AccessControlType -ne 'Allow' -or $rule.FileSystemRights -ne 'FullControl' -or $rule.IsInherited -or $rule.InheritanceFlags.ToString() -ne 'ContainerInherit, ObjectInherit' -or $rule.PropagationFlags.ToString() -ne 'None'){$valid=$false}}
  if(-not $valid){[IO.FileSystemAclExtensions]::SetAccessControl([IO.DirectoryInfo]::new($Directory),$acl)}
}
function Ds-State([string]$StateFile,[switch]$CheckSource) {
  Ds-CheckPath $StateFile
  $s=Ds-ReadJson $StateFile
  if($s.schemaVersion -cne 'desksom.install/v1' -or $s.plan.binding.host -cne [Environment]::MachineName -or $s.plan.binding.sid -cne (Ds-CurrentSid)){
    Ds-Fail 'IDENTITY_MISMATCH' 'Installation record belongs to another host or user.'
  }
  if($StateFile -ine (Join-Path $s.plan.stateRoot 'install.json')){Ds-Fail 'STATE_PATH_MISMATCH' 'The state-file location does not match its binding.'}
  if($s.runtimeRoot -ine (Join-Path $s.plan.installRoot 'runtime')){Ds-Fail 'RUNTIME_PATH_MISMATCH' 'The runtime path is not inside its owned installation root.'}
  Ds-CheckPath $s.plan.installRoot;Ds-CheckPath $s.runtimeRoot
  $marker=Ds-ReadJson (Join-Path $s.plan.installRoot '.desksom-owner.json')
  if($marker.installationId -cne $s.installationId -or $marker.planSha256 -cne $s.planSha256){Ds-Fail 'OWNER_MISMATCH' 'Runtime ownership does not match this state record.'}
  if($CheckSource){
    $mf=Join-Path $s.runtimeRoot 'release-manifest.json'
    if((Get-FileHash -LiteralPath $mf -Algorithm SHA256).Hash.ToLowerInvariant() -cne $s.releaseManifestSha256){Ds-Fail 'SOURCE_DRIFT' 'The runtime manifest has changed.'}
    $manifest=Ds-ReadJson $mf
    foreach($entry in $manifest.files){
      if($entry.path -match '(^/|\\|(^|/)\.\.(/|$)|:)'){Ds-Fail 'SOURCE_DRIFT' 'Invalid runtime source path.'}
      $p=Join-Path $s.runtimeRoot $entry.path;Ds-CheckPath $p
      if((Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.sha256){Ds-Fail 'SOURCE_DRIFT' 'A runtime source file has changed.'}
    }
  }
  return $s
}
function Ds-Mutex([string]$StateRoot) {
  $hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath($StateRoot).ToLowerInvariant())))
  return [Threading.Mutex]::new($false,('Local\DeskSom-install-'+$hash))
}
function Ds-TaskName([string]$Name) {if($Name -cnotmatch '^DeskSom-[a-z][a-z0-9-]{0,23}-(Local|Tunnel)$'){Ds-Fail 'INVALID_TASK_NAME' 'Task name is outside the DeskSom namespace.'}}
function Ds-TaskGet([string]$Name) {
  Ds-TaskName $Name
  $task=Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
  if($null -eq $task){return $null}
  if(@($task.Actions).Count -ne 1){Ds-Fail 'TASK_DRIFT' 'The task has an unexpected number of actions.'}
  $sid=$task.Principal.UserId
  if($sid -notmatch '^S-1-'){try{$sid=[Security.Principal.NTAccount]::new($sid).Translate([Security.Principal.SecurityIdentifier]).Value}catch{$sid='UNRESOLVED'}}
  $id='';if($task.Description -match '^DeskSom installation: ([0-9a-f-]{36})$'){$id=$Matches[1]}
  return @{name=$Name;execute=$task.Actions[0].Execute;arguments=$task.Actions[0].Arguments;workingDirectory=$task.Actions[0].WorkingDirectory;
    sid=$sid;runLevel=$task.Principal.RunLevel.ToString();logonType=$task.Principal.LogonType.ToString();installationId=$id;state=$task.State.ToString();enabled=[bool]$task.Settings.Enabled}
}
function Ds-ExpectedTask($State,[string]$Kind) {
  $key=if($Kind -eq 'local'){'local'}elseif($Kind -eq 'tunnel'){'tunnel'}else{Ds-Fail 'INVALID_KIND' 'Unknown service kind.'}
  return @{name=$State.plan.tasks[$key];execute=$State.environment.wscript;arguments=('//B //Nologo "'+(Join-Path $State.plan.installRoot ('Launch-'+$key+'.vbs'))+'"');
    workingDirectory=$State.plan.installRoot;sid=$State.plan.binding.sid;runLevel='Limited';logonType='Interactive';installationId=$State.installationId}
}
function Ds-AssertTask($Task,$Expected) {
  if($null -eq $Task){Ds-Fail 'TASK_MISSING' 'The expected task is absent.'}
  foreach($key in @('name','execute','arguments','workingDirectory','sid','runLevel','logonType','installationId')){
    if([string]$Task[$key] -ine [string]$Expected[$key]){Ds-Fail 'TASK_DRIFT' 'The task does not match the owned installation.'}
  }
}
function Ds-Secret([string]$Path) {
  Ds-CheckPath $Path
  $secure=(Get-Content -LiteralPath $Path -Raw -Encoding utf8).Trim()|ConvertTo-SecureString
  $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try{return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$secure.Dispose()}
}
function Ds-SaveSecret([string]$Path,[Security.SecureString]$Secret) {
  Ds-CheckPath $Path
  $bytes=[Text.Encoding]::UTF8.GetBytes((ConvertFrom-SecureString $Secret))
  $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
}
function Ds-Rpc($State,[string]$Method,$Parameters=@{},[switch]$NoAuth) {
  $headers=@{Accept='application/json, text/event-stream';'Mcp-Protocol-Version'='2026-07-28';'Mcp-Method'=$Method}
  $meta=@{'io.modelcontextprotocol/protocolVersion'='2026-07-28';'io.modelcontextprotocol/clientInfo'=@{name='desksom-local-verifier';version='0.2.0'};'io.modelcontextprotocol/clientCapabilities'=@{}}
  $params=@{};foreach($key in $Parameters.Keys){$params[$key]=$Parameters[$key]};$params._meta=$meta
  if($Method -eq 'tools/call'){$headers['Mcp-Name']=$params.name}
  if(-not $NoAuth){$headers.Authorization='Bearer '+(Ds-Secret (Join-Path $State.plan.stateRoot 'http-token.dpapi'))}
  $body=@{jsonrpc='2.0';id=[Guid]::NewGuid().ToString('N');method=$Method;params=$params}|ConvertTo-Json -Depth 20 -Compress
  try{
    $resp=Invoke-WebRequest -Uri ('http://127.0.0.1:'+$State.plan.port+'/mcp') -Method Post -Headers $headers -ContentType 'application/json' -Body $body -SkipHttpErrorCheck -TimeoutSec 8
    return @{status=[int]$resp.StatusCode;body=($resp.Content|ConvertFrom-Json -AsHashtable)}
  }finally{$headers.Remove('Authorization');Remove-Variable body -ErrorAction SilentlyContinue}
}
function Ds-Probe($State) {
  try{
    $r=Ds-Rpc $State 'tools/call' @{name='desksom_status';arguments=@{}}
    if($r.status -ne 200 -or $r.body.ContainsKey('error') -or -not $r.body.result.ContainsKey('structuredContent')){return @{ready=$false;reason='INVALID_STATUS_RESPONSE'}}
    $v=$r.body.result.structuredContent
    $out=@{};foreach($key in @('host','version','instance','installationId','sourceFingerprint','bootId','ready','activeCalls','upstreamVersion','mode','allowedFileRoots','rootsRevision','statistics','readinessContract','indexWorkerReady','allFeaturesReady','indexStatus','projectInspection')){if($v.ContainsKey($key)){$out[$key]=$v[$key]}}
    return $out
  }catch{return @{ready=$false;reason='LOCAL_UNREACHABLE_OR_UNAUTHENTICATED'}}
}
function Ds-Identity($Probe,$State) {
  return ($Probe.ready -eq $true -and $Probe.host -ceq $State.plan.binding.host -and $Probe.version -ceq $State.plan.version -and
    $Probe.installationId -ceq $State.installationId -and $Probe.sourceFingerprint -ceq $State.plan.sourceFingerprint -and $Probe.instance -ceq $State.plan.instance)
}
function Ds-TunnelProbe($State) {
  $file=Join-Path $State.plan.stateRoot 'tunnel-health-url.txt'
  if(-not(Test-Path -LiteralPath $file)){return @{ready=$false;controlPlane='not_observed';reason='NO_HEALTH_RECEIPT'}}
  try{
    $url=(Get-Content -LiteralPath $file -Raw -Encoding utf8).Trim().TrimEnd('/')
    if($url -cnotmatch '^http://127\.0\.0\.1:[1-9][0-9]{1,4}$'){return @{ready=$false;controlPlane='invalid_health_url'}}
    $owner=@(Get-NetTCPConnection -State Listen -LocalPort ([Uri]$url).Port -ErrorAction SilentlyContinue | Where-Object LocalAddress -eq '127.0.0.1')
    if($owner.Count -ne 1){return @{ready=$false;controlPlane='no_listener'}}
    $proc=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$owner[0].OwningProcess)
    if($proc.ExecutablePath -ine (Join-Path $State.runtimeRoot 'bin\tunnel-client.exe')){return @{ready=$false;controlPlane='foreign_listener'}}
    $v=Invoke-RestMethod ($url+'/health?details=true') -TimeoutSec 5
    return @{ready=[bool]$v.ready;controlPlane=[string]$v.components.'control-plane'.status;pollState=[string]$v.components.'control-plane'.state;
      consecutiveFailures=$v.components.'control-plane'.details.consecutive_failures;responseDelivery=[string]$v.components.'response-delivery'.status}
  }catch{return @{ready=$false;controlPlane='unavailable'}}
}
function Ds-Processes($State,[string]$Kind) {
  $root=$State.runtimeRoot
  $all=@(Get-CimInstance Win32_Process)
  $broker=Join-Path $root 'broker.mjs';$engine=Join-Path $root 'engine.mjs'
  $runner=Join-Path $root 'scripts\Run-Service.ps1';$launcher=Join-Path $root 'scripts\Task-Launcher.ps1'
  $tunnel=Join-Path $root 'bin\tunnel-client.exe'
  $matches=@($all|Where-Object {
    if($_.ProcessId -eq $PID){return $false}
    $cmd=[string]$_.CommandLine
    $local=$_.Name -eq 'node.exe' -and ($cmd.IndexOf($broker,[StringComparison]::OrdinalIgnoreCase) -ge 0 -or $cmd.IndexOf($engine,[StringComparison]::OrdinalIgnoreCase) -ge 0)
    $remote=$_.Name -eq 'tunnel-client.exe' -and $_.ExecutablePath -ieq $tunnel
    $wrapper=$_.Name -in @('pwsh.exe','powershell.exe') -and ($cmd.IndexOf($runner,[StringComparison]::OrdinalIgnoreCase) -ge 0 -or $cmd.IndexOf($launcher,[StringComparison]::OrdinalIgnoreCase) -ge 0)
    if($Kind -eq 'local'){return ($local -or ($wrapper -and $cmd -match '-Kind local'))}
    if($Kind -eq 'tunnel'){return ($remote -or ($wrapper -and $cmd -match '-Kind tunnel'))}
    return ($local -or $remote -or $wrapper)
  })
  return $matches
}
function Ds-EnsureLaunchers($State) {
  foreach($kind in @('local','tunnel')){
    $launcher=Join-Path $State.plan.installRoot ('Launch-'+$kind+'.vbs')
    $command='"'+$State.environment.windowsPowerShell+'" -NoProfile -NonInteractive -WindowStyle Hidden -File "'+(Join-Path $State.runtimeRoot 'scripts\Task-Launcher.ps1')+'" -StateFile "'+(Join-Path $State.plan.stateRoot 'install.json')+'" -Kind '+$kind
    $escaped=$command.Replace('"','""')
    $content=@('Option Explicit','Dim sh, rc','Set sh = CreateObject("WScript.Shell")',('rc = sh.Run("'+$escaped+'", 0, True)'),'WScript.Quit rc') -join "`r`n"
    if(Test-Path -LiteralPath $launcher){if([IO.File]::ReadAllText($launcher) -cne $content){Ds-Fail 'LAUNCHER_DRIFT' 'A launcher has changed. It will not be overwritten.'}}
    else{[IO.File]::WriteAllText($launcher,$content,[Text.UTF8Encoding]::new($false))}
  }
}

function Ds-TrayLinks($State,[ValidateSet('install','remove','launch','status')][string]$Mode) {
  $startup=[Environment]::GetFolderPath([Environment+SpecialFolder]::Startup)
  $programs=[Environment]::GetFolderPath([Environment+SpecialFolder]::Programs)
  $label='DeskSom-'+$State.plan.instance
  $tray=Join-Path $State.runtimeRoot 'scripts\Tray-App.ps1'
  $panel=Join-Path $State.runtimeRoot 'scripts\ControlPanel.ps1'
  $stateFile=Join-Path $State.plan.stateRoot 'install.json'
  $exe=$State.environment.windowsPowerShell
  $expected=@(
    @{path=(Join-Path $startup ($label+'.lnk'));script=$tray;arguments=('-NoProfile -STA -WindowStyle Hidden -File "'+$tray+'" -StateFile "'+$stateFile+'"');desc=('DeskSom tray installation: '+$State.installationId)},
    @{path=(Join-Path $programs ($label+' Control Panel.lnk'));script=$panel;arguments=('-NoProfile -STA -WindowStyle Hidden -File "'+$panel+'" -StateFile "'+$stateFile+'"');desc=('DeskSom control panel installation: '+$State.installationId)}
  )
  $shell=New-Object -ComObject WScript.Shell
  foreach($link in $expected){
    Ds-CheckPath $link.path
    $present=Test-Path -LiteralPath $link.path -PathType Leaf
    if($present){
      $actual=$shell.CreateShortcut($link.path)
      if($actual.TargetPath -ine $exe -or $actual.Arguments -cne $link.arguments -or $actual.Description -cne $link.desc -or
         $actual.WorkingDirectory -ine $State.plan.installRoot){
         Ds-Fail 'TRAY_SHORTCUT_DRIFT' 'An existing Windows startup or Start Menu shortcut differs from this installation. It will not be overwritten or removed.'
      }
    }elseif($Mode -eq 'install'){
      $shortcut=$shell.CreateShortcut($link.path)
      $shortcut.TargetPath=$exe
      $shortcut.Arguments=$link.arguments
      $shortcut.WorkingDirectory=$State.plan.installRoot
      $shortcut.Description=$link.desc
      $shortcut.WindowStyle=7
      $shortcut.Save()
      if(-not(Test-Path -LiteralPath $link.path)){Ds-Fail 'TRAY_SHORTCUT_UNCERTAIN' 'Windows did not confirm shortcut creation.'}
    }
    if($Mode -eq 'remove' -and $present){Remove-Item -LiteralPath $link.path -Force}
  }
  if($Mode -eq 'launch'){
    $run=$expected[0]
    if(-not(Test-Path -LiteralPath $run.path)){Ds-Fail 'TRAY_NOT_CONFIGURED' 'Install the owned startup shortcut first.'}
    $existing=@(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'"|Where-Object {
      $_.CommandLine -and $_.CommandLine.IndexOf($tray,[StringComparison]::OrdinalIgnoreCase) -ge 0 -and
      $_.CommandLine.IndexOf($stateFile,[StringComparison]::OrdinalIgnoreCase) -ge 0
    })
    if($existing.Count){return @{configured=$true;alreadyRunning=$true;started=$false}}
    $launched=Start-Process -FilePath $exe -ArgumentList $run.arguments -WorkingDirectory $State.plan.installRoot -PassThru
    return @{configured=$true;started=$true;pid=$launched.Id}
  }
  return @{configured=($Mode -eq 'install' -or $Mode -eq 'status');mode=$Mode;
    startupShortcutExists=(Test-Path -LiteralPath $expected[0].path);
    controlPanelShortcutExists=(Test-Path -LiteralPath $expected[1].path)}
}

function Ds-ExtractTunnel($State,$Policy) {
  if($Policy.tunnelArchiveUrl -cne 'https://github.com/openai/tunnel-client/releases/download/v0.0.16/tunnel-client-v0.0.16-windows-amd64.zip'){
    Ds-Fail 'UNAPPROVED_DOWNLOAD' 'Tunnel download URL is not the reviewed upstream release.'
  }
  $cache=Join-Path $State.plan.installRoot 'download-cache';[void][IO.Directory]::CreateDirectory($cache)
  $zip=Join-Path $cache 'tunnel-client-v0.0.16.zip'
  if(-not(Test-Path -LiteralPath $zip)){
    $partial=Join-Path $cache ('download-'+[Guid]::NewGuid().ToString('N')+'.partial')
    try{
      Invoke-WebRequest -Uri $Policy.tunnelArchiveUrl -OutFile $partial -TimeoutSec 120
      if((Get-Item -LiteralPath $partial).Length -gt $Policy.maximumArchiveBytes -or (Get-FileHash -LiteralPath $partial).Hash.ToLowerInvariant() -cne $Policy.tunnelArchiveSha256){Ds-Fail 'DOWNLOAD_HASH_MISMATCH' 'Downloaded archive failed size or SHA-256 validation.'}
      [IO.File]::Move($partial,$zip)
    }finally{if(Test-Path -LiteralPath $partial){Remove-Item -LiteralPath $partial -Force}}
  }
  if((Get-FileHash -LiteralPath $zip).Hash.ToLowerInvariant() -cne $Policy.tunnelArchiveSha256){Ds-Fail 'DOWNLOAD_HASH_MISMATCH' 'Cached archive is corrupt; it will not be executed.'}
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive=[IO.Compression.ZipFile]::OpenRead($zip)
  $destination=Join-Path $State.runtimeRoot 'bin';[void][IO.Directory]::CreateDirectory($destination)
  try{
    $seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase);$bytes=0L
    foreach($entry in $archive.Entries){
      if($entry.FullName -match '(^/|\\|(^|/)\.\.(/|$)|:)' -or -not $seen.Add($entry.FullName)){Ds-Fail 'INVALID_ARCHIVE' 'Unsafe or duplicate archive entry.'}
      $bytes+=$entry.Length;if($bytes -gt $Policy.maximumExtractedBytes){Ds-Fail 'INVALID_ARCHIVE' 'Extracted archive is too large.'}
      if(($entry.ExternalAttributes -shr 16 -band 61440) -eq 40960){Ds-Fail 'INVALID_ARCHIVE' 'Archive symlinks are not allowed.'}
    }
    foreach($entry in $archive.Entries){
      if($entry.FullName.EndsWith('/')){continue}
      $out=Join-Path $destination $entry.FullName;Ds-CheckPath $out;[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($out))
      if(Test-Path -LiteralPath $out){
        $stream=$entry.Open();try{$wanted=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)).ToLowerInvariant()}finally{$stream.Dispose()}
        if((Get-FileHash -LiteralPath $out).Hash.ToLowerInvariant() -cne $wanted){Ds-Fail 'TUNNEL_BINARY_DRIFT' 'Existing extracted files differ from the pinned archive.'}
      }else{[IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$out,$false)}
    }
  }finally{$archive.Dispose()}
  if((Get-FileHash -LiteralPath (Join-Path $destination 'tunnel-client.exe')).Hash.ToLowerInvariant() -cne $Policy.tunnelExeSha256){Ds-Fail 'TUNNEL_BINARY_DRIFT' 'Pinned executable verification failed.'}
  return @{verified=$true}
}
function Ds-ToolSucceeded($Response) {
  if($Response -isnot [Collections.IDictionary] -or -not $Response.Contains('status') -or $Response.status -ne 200){return $false}
  if(-not $Response.Contains('body') -or $Response.body -isnot [Collections.IDictionary]){return $false}
  $body=$Response.body
  if($body.Contains('error') -or -not $body.Contains('result') -or $body.result -isnot [Collections.IDictionary]){return $false}
  $result=$body.result
  if($result.Contains('isError') -and ($result.isError -isnot [bool] -or $result.isError)){return $false}
  return ($result.Contains('content') -and $result.content -is [array])
}
function Ds-VerifyMcp($State,[bool]$Exercise) {
  $checks=[Collections.Generic.List[object]]::new()
  $probe=Ds-Probe $State
  if(-not(Ds-Identity $probe $State)){Ds-Fail 'LOCAL_IDENTITY_FAILED' 'The local broker identity is not the expected installation.'}
  $checks.Add(@{id='identity';status='PASS'})
  $unauth=Ds-Rpc $State 'server/discover' @{} -NoAuth
  if($unauth.status -ne 401){Ds-Fail 'AUTHENTICATION_FAILED' 'Unauthenticated access was not rejected.'}
  $checks.Add(@{id='unauthenticated_rejected';status='PASS'})
  $discovery=Ds-Rpc $State 'server/discover'
  if($discovery.status -ne 200 -or $discovery.body.ContainsKey('error') -or $discovery.body.result.resultType -ne 'complete' -or
    $discovery.body.result.ttlMs -ne 0 -or $discovery.body.result.cacheScope -ne 'private') {Ds-Fail 'DISCOVERY_FAILED' 'Modern discovery failed validation.'}
  $checks.Add(@{id='modern_discovery';status='PASS'})
  $catalog=Ds-Rpc $State 'tools/list'
  if($catalog.status -ne 200 -or $catalog.body.ContainsKey('error') -or -not $catalog.body.ContainsKey('result')){
    Ds-Fail 'TOOL_CATALOG_FAILED' 'The local broker catalog could not be read.'
  }
  $indexed=($State.ContainsKey('indexProfile') -and $State.indexProfile.enabled -eq $true)
  $inspection=($State.ContainsKey('projectInspectEnabled') -and $State.projectInspectEnabled -is [bool] -and $State.projectInspectEnabled -eq $true)
  # Exact qualified MCP names, not merely a count. A different 24-name set is drift.
  $expectedBase=@('desksom_status','get_config','read_file','read_multiple_files','write_file','write_pdf',
    'create_directory','list_directory','move_file','start_search','get_more_search_results','stop_search',
    'list_searches','get_file_info','edit_block','start_process','read_process_output','interact_with_process',
    'force_terminate','list_sessions','list_processes','kill_process','get_usage_stats','get_recent_tool_calls')
  $tools=@($catalog.body.result.tools)
  $actualNames=@($tools|ForEach-Object {$_.name})
  $expectedNames=@($expectedBase)
  if($indexed){$expectedNames+=@('find_files_fast')}
  if($inspection){$expectedNames+=@('inspect_project')}
  $unique=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $validNames=($actualNames.Count -eq $expectedNames.Count)
  foreach($name in $actualNames){
    if($name -isnot [string] -or -not $unique.Add([string]$name) -or $name -cnotin $expectedNames){$validNames=$false}
  }
  if(-not $validNames -or $unique.Count -ne $expectedNames.Count){
    Ds-Fail 'TOOL_CATALOG_FAILED' 'The broker catalog names or uniqueness differ from the qualified exact 24/25/26-tool profile.'
  }
  $text=$catalog.body.result|ConvertTo-Json -Depth 30 -Compress
  if($text -match 'ui://desktop-commander/'){Ds-Fail 'UNSERVED_UI_REFERENCE' 'The catalog advertises unsupported UI resources.'}
  $checks.Add(@{id='tool_catalog_and_no_unserved_ui';status='PASS'})
  if($Exercise){
    foreach($prior in @(Get-ChildItem -LiteralPath $State.plan.stateRoot -Filter 'verification-*.json' -File)){
      $receiptState=Ds-ReadJson $prior.FullName
      if($receiptState.phase -notin @('PASS','RECONCILED')){Ds-Fail 'VERIFICATION_OUTCOME_UNCERTAIN' 'A previous disposable test has an unresolved receipt. Inspect and reconcile it before creating another test file.'}
    }
    $roots=@(if($State.ContainsKey('activeAllowedDirectories') -and @($State.activeAllowedDirectories).Count){$State.activeAllowedDirectories}else{$State.plan.allowedDirectories})
    $nonce=[Guid]::NewGuid().ToString('N');$filename=Join-Path $roots[0] ('desksom-check-'+$nonce+'.txt')
    if(Test-Path -LiteralPath $filename){Ds-Fail 'FIXTURE_COLLISION' 'A verification fixture already exists; it will not be overwritten.'}
    Ds-CheckPath $filename
    $content='DeskSom disposable verification '+$nonce
    $receipt=Join-Path $State.plan.stateRoot ('verification-'+$nonce+'.json')
    Ds-WriteJson $receipt @{schemaVersion='desksom.verification/v1';path=$filename;nonce=$nonce;phase='INTENT';at=[DateTime]::UtcNow.ToString('o')}
    $write=Ds-Rpc $State 'tools/call' @{name='write_file';arguments=@{path=$filename;content=$content;mode='rewrite'}}
    if(-not(Ds-ToolSucceeded $write)){Ds-Fail 'FIXTURE_WRITE_UNCERTAIN' 'The disposable write did not return success; inspect its local receipt before retrying.'}
    Ds-WriteJson $receipt @{schemaVersion='desksom.verification/v1';path=$filename;nonce=$nonce;phase='WRITTEN';at=[DateTime]::UtcNow.ToString('o')}
    $read=Ds-Rpc $State 'tools/call' @{name='read_file';arguments=@{path=$filename}}
    if(-not(Ds-ToolSucceeded $read)){Ds-Fail 'FIXTURE_READ_FAILED' 'The disposable read failed.'}
    $readText=($read.body.result.content|Where-Object type -eq 'text'|ForEach-Object text)-join "`n"
    if(-not $readText.Contains($content) -or [IO.File]::ReadAllText($filename).TrimEnd("`r","`n") -cne $content){Ds-Fail 'FIXTURE_MISMATCH' 'The verification bytes differ; the file is retained.'}
    # Delete only the unique fixture whose exact content was just independently verified.
    Ds-CheckPath $filename
    Remove-Item -LiteralPath $filename -Force
    if(Test-Path -LiteralPath $filename){Ds-Fail 'FIXTURE_DELETE_UNCONFIRMED' 'The verification fixture still exists.'}
    Ds-WriteJson $receipt @{schemaVersion='desksom.verification/v1';phase='PASS';nonce=$nonce;removed=$true;at=[DateTime]::UtcNow.ToString('o')}
    $checks.Add(@{id='disposable_write_read_independent_check_cleanup';status='PASS'})
  }
  return @{passed=$true;checks=$checks.ToArray();exercise=$Exercise;chatGPTVerified=$false}
}
function Ds-QuiesceOwnerIdentity($Probe,$State) {
  # The index may legitimately be STALE while the same authenticated broker
  # and its writer are still alive. Ready=false is not a foreign process.
  if($null -eq $Probe -or $null -eq $State -or $Probe -isnot [System.Collections.IDictionary]){return $false}
  foreach($field in @('host','version','instance','installationId','sourceFingerprint','bootId','activeCalls')){
    if(-not $Probe.Contains($field)){return $false}
  }
  return ($Probe.host -ceq $State.plan.binding.host -and
    $Probe.version -ceq $State.plan.version -and
    $Probe.instance -ceq $State.plan.instance -and
    $Probe.installationId -ceq $State.installationId -and
    $Probe.sourceFingerprint -ceq $State.plan.sourceFingerprint -and
    $Probe.bootId -match '^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$' -and
    $null -ne $Probe.activeCalls -and [int]$Probe.activeCalls -eq 0)
}
function Ds-StopService($State,[string]$Kind) {
  $expected=Ds-ExpectedTask $State $Kind;$task=Ds-TaskGet $expected.name;Ds-AssertTask $task $expected
  # Every local broker stop must atomically close MCP admission. The
  # previous idle probe is not sufficient across an asynchronous owner Apply.
  # Never modify a stale or unknown writer lease.
  if($Kind -eq 'local'){
    $indexed=($State.ContainsKey('indexProfile') -and $State.indexProfile.enabled -eq $true)
    $observed=Ds-Probe $State
    if(-not (Ds-QuiesceOwnerIdentity $observed $State)){
      Ds-Fail 'BROKER_QUIESCE_IDENTITY' 'Local service is not the verified idle owner broker.'
    }
    $headers=@{Authorization=('Bearer '+(Ds-Secret (Join-Path $State.plan.stateRoot 'http-token.dpapi')))}
    $payload=@{installationId=$State.installationId;bootId=$observed.bootId}|ConvertTo-Json -Compress
    try{
      $response=Invoke-WebRequest -Uri ('http://127.0.0.1:'+$State.plan.port+'/index-quiesce') -Method Post -Headers $headers -ContentType 'application/json' -Body $payload -SkipHttpErrorCheck -TimeoutSec 10
      if([int]$response.StatusCode -ne 200){Ds-Fail 'BROKER_QUIESCE_FAILED' 'Authenticated idle shutdown was not confirmed; leave service running.'}
      $ack=$response.Content|ConvertFrom-Json -AsHashtable
      $expectedStatus=if($indexed){'INDEX_QUIESCED'}else{'BROKER_QUIESCED'}
      if($ack.status -cne $expectedStatus -or $ack.bootId -cne $observed.bootId -or
        $ack.installationId -cne $State.installationId -or
        $ack.indexEnabled -cne $indexed -or $ack.writerLeaseReleased -cne $indexed){
        Ds-Fail 'BROKER_QUIESCE_MISMATCH' 'Shutdown response was not bound to this boot and index profile.'
      }
    }finally{$headers.Remove('Authorization');Remove-Variable payload -ErrorAction SilentlyContinue}
    if($indexed){
      foreach($item in @($State.indexProfile.indices)){
        if(Test-Path -LiteralPath ($item.database+'.writer-lock')){
          Ds-Fail 'INDEX_WRITER_LEASE_RETAINED' 'The writer lock remains after shutdown. Do not stop/restart or remove the lock.'
        }
      }
    }
  }
  $roots=@(Ds-Processes $State $Kind);$all=@(Get-CimInstance Win32_Process)
  $targets=[Collections.Generic.List[object]]::new();$ids=[Collections.Generic.HashSet[uint32]]::new();$queue=[Collections.Generic.Queue[object]]::new()
  foreach($p in $roots){$queue.Enqueue($p)}
  while($queue.Count){$p=$queue.Dequeue();if(-not $ids.Add([uint32]$p.ProcessId)){continue};$targets.Add($p)
    foreach($c in @($all|Where-Object {$_.ParentProcessId -eq $p.ProcessId -and $_.CreationDate -ge $p.CreationDate})){$queue.Enqueue($c)}
  }
  Disable-ScheduledTask -TaskName $expected.name|Out-Null
  Stop-ScheduledTask -TaskName $expected.name -ErrorAction Stop
  for($i=$targets.Count-1;$i -ge 0;$i--){
    $p=$targets[$i];$handle=$null
    try{
      $handle=[Diagnostics.Process]::GetProcessById([int]$p.ProcessId);$null=$handle.Handle
      if([Math]::Abs(($handle.StartTime.ToUniversalTime()-$p.CreationDate.ToUniversalTime()).TotalMilliseconds) -gt 50){Ds-Fail 'PID_IDENTITY_CHANGED' 'Process identity changed during stop; not terminating it.'}
      $handle.Kill();[void]$handle.WaitForExit(3000)
    }catch [ArgumentException]{}catch [InvalidOperationException]{}finally{if($null -ne $handle){$handle.Dispose()}}
  }
  return @{stopped=$true;kind=$Kind;ownedProcesses=$targets.Count}
}
function Ds-Environment([string]$Node) {
  $user=[Security.Principal.WindowsIdentity]::GetCurrent()
  $principal=[Security.Principal.WindowsPrincipal]::new($user)
  $major=[int]((& $Node --version).TrimStart('v').Split('.')[0])
  $npm=Join-Path (Split-Path -Parent $Node) 'node_modules\npm\bin\npm-cli.js'
  if(-not(Test-Path -LiteralPath $npm)){
    $npmCmd=Get-Command npm.cmd -ErrorAction SilentlyContinue
    if($npmCmd){$npm=Join-Path (Split-Path -Parent $npmCmd.Source) 'node_modules\npm\bin\npm-cli.js'}
  }
  if(-not(Test-Path -LiteralPath $npm)){Ds-Fail 'NPM_UNAVAILABLE' 'The Node.js npm CLI could not be located.'}
  $pwsh=(Get-Command pwsh.exe -ErrorAction Stop).Source
  # Prefer a version-independent Store alias or the stable MSI directory.
  foreach($candidate in @((Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\pwsh.exe'),(Join-Path $env:ProgramFiles 'PowerShell\7\pwsh.exe'))){if(Test-Path -LiteralPath $candidate){$pwsh=$candidate;break}}
  return @{platform='win32';architecture=[Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant();
    host=[Environment]::MachineName;sid=$user.User.Value;elevated=$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator);
    localAppData=$env:LOCALAPPDATA;windowsDir=$env:WINDIR;programFiles=$env:ProgramFiles;
    node=$Node;nodeMajor=$major;nodeVersion=(& $Node --version).Trim();npmCli=$npm;pwsh=$pwsh;pwshVersion=$PSVersionTable.PSVersion.ToString();pwshSupported=($PSVersionTable.PSVersion -ge [Version]'7.4.0');
    wscript=(Join-Path $env:WINDIR 'System32\wscript.exe');windowsPowerShell=(Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe')}
}
if($Action -eq 'Library'){return}
if($Action -eq 'Lock'){
  $request=([Console]::In.ReadLine())|ConvertFrom-Json -AsHashtable
  $mutex=Ds-Mutex $request.stateRoot;$held=$false
  try{
    try{$held=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true}
    if(-not $held){[Console]::Out.WriteLine('{"ok":false,"code":"INSTALL_BUSY"}');exit 23}
    [Console]::Out.WriteLine('{"ok":true}');[Console]::Out.Flush()
    [void][Console]::In.ReadLine()
  }finally{if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
  exit 0
}
try{
  $q=([Console]::In.ReadLine())|ConvertFrom-Json -AsHashtable
  $value=switch($q.op){
    'environment' {Ds-Environment $q.node;break}
    'protect-directory' {Ds-Protect $q.directory;@{protected=$true};break}
    'legacy-present' { [bool](Get-ScheduledTask -TaskName 'SomnerAI DeskSom Local MCP' -ErrorAction SilentlyContinue);break }
    'port-owner' { [bool](@(Get-NetTCPConnection -LocalPort ([int]$q.port) -State Listen -ErrorAction SilentlyContinue).Count);break }
    'task-get' {Ds-TaskGet $q.name;break}
    'task-create' {
      $d=$q.definition;Ds-TaskName $d.name
      if($d.sid -cne (Ds-CurrentSid) -or $d.runLevel -cne 'Limited' -or $d.logonType -cne 'Interactive' -or $d.execute -ine (Join-Path $env:WINDIR 'System32\wscript.exe')){Ds-Fail 'TASK_POLICY' 'Task definition is outside the permitted policy.'}
      if(Get-ScheduledTask -TaskName $d.name -ErrorAction SilentlyContinue){Ds-Fail 'TASK_EXISTS' 'Task already exists; no overwrite was attempted.'}
      $act=New-ScheduledTaskAction -Execute $d.execute -Argument $d.arguments -WorkingDirectory $d.workingDirectory
      $trigger=New-ScheduledTaskTrigger -AtLogOn -User $d.sid;$trigger.Delay='PT10S'
      $principal=New-ScheduledTaskPrincipal -UserId $d.sid -LogonType Interactive -RunLevel Limited
      $settings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 20 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
      Register-ScheduledTask -TaskName $d.name -Action $act -Trigger $trigger -Principal $principal -Settings $settings -Description ('DeskSom installation: '+$d.installationId)|Out-Null
      @{created=$true};break
    }
    'task-start' {Ds-TaskName $q.name;Start-ScheduledTask -TaskName $q.name;@{startRequested=$true};break}
    'task-enable' {Ds-TaskName $q.name;Enable-ScheduledTask -TaskName $q.name|Out-Null;@{enabled=$true};break}
    'processes' {$s=Ds-State $q.stateFile;$p=@(Ds-Processes $s $q.kind);@{count=$p.Count};break}
    'probe' {$s=Ds-State $q.stateFile;Ds-Probe $s;break}
    'tunnel-probe' {$s=Ds-State $q.stateFile;Ds-TunnelProbe $s;break}
    'verify' {$s=Ds-State $q.stateFile -CheckSource;Ds-VerifyMcp $s ([bool]$q.exercise);break}
    'ensure-secret' {
      $s=Ds-State $q.stateFile -CheckSource;Ds-Protect $s.plan.stateRoot;$file=Join-Path $s.plan.stateRoot 'http-token.dpapi'
      if(Test-Path -LiteralPath $file){$plain=Ds-Secret $file;if($plain -cnotmatch '^[0-9a-f]{64}$'){Ds-Fail 'CREDENTIAL_INVALID' 'The stored local bearer cannot be verified; it was not replaced.'};Remove-Variable plain}
      else{
        $text=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant();$secret=ConvertTo-SecureString $text -AsPlainText -Force
        try{Ds-SaveSecret $file $secret}finally{$secret.Dispose();Remove-Variable text}
      };@{present=$true;plaintextReturned=$false};break
    }
    'ensure-launchers' {$s=Ds-State $q.stateFile -CheckSource;Ds-EnsureLaunchers $s;@{verified=$true};break}
    'tray-install' {$s=Ds-State $q.stateFile -CheckSource;Ds-TrayLinks $s 'install';break}
    'tray-status' {$s=Ds-State $q.stateFile;Ds-TrayLinks $s 'status';break}
    'tray-launch' {$s=Ds-State $q.stateFile -CheckSource;Ds-TrayLinks $s 'launch';break}
    'tray-remove' {$s=Ds-State $q.stateFile -CheckSource;Ds-TrayLinks $s 'remove';break}
    'prepare-tunnel' {$s=Ds-State $q.stateFile -CheckSource;Ds-ExtractTunnel $s $q.policy;break}
    'stop-service' {$s=Ds-State $q.stateFile -CheckSource;Ds-StopService $s $q.kind;break}
    'remove-stopped-task' {
      $s=Ds-State $q.stateFile -CheckSource;$d=Ds-ExpectedTask $s $q.kind;$t=Ds-TaskGet $d.name
      if($t){Ds-AssertTask $t $d;if($t.state -in @('Running','Queued')){Ds-Fail 'TASK_RUNNING' 'A running task will not be removed.'};Unregister-ScheduledTask -TaskName $d.name -Confirm:$false}
      @{removed=$true;dataDeleted=$false};break
    }
    default {Ds-Fail 'UNKNOWN_OPERATION' 'This Windows operation is not implemented.'}
  }
  [Console]::Out.WriteLine((@{ok=$true;value=$value}|ConvertTo-Json -Depth 30 -Compress))
  exit 0
}catch{
  $message=$_.Exception.Message;$code='WINDOWS_OPERATION_FAILED';$safe='A Windows operation failed. Inspect local state; no success is claimed.'
  if($message -match '^([A-Z_]+)\|([^\r\n]+)$'){$code=$Matches[1];$safe=$Matches[2]}
  [Console]::Out.WriteLine((@{ok=$false;code=$code;message=$safe;nextAction='Inspect the reported condition before retrying.';exitCode=24}|ConvertTo-Json -Compress))
  exit 24
}
