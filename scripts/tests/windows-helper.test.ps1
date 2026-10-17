#requires -Version 7.4
# Deterministic native regression tests: synthetic MCP replies; no API keys or tasks.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'WindowsHost.ps1') -Action Library
$checks=[Collections.Generic.List[object]]::new()
function Check([string]$Name,[bool]$Condition){if(-not $Condition){throw ('TEST_FAILED: '+$Name)};$checks.Add(@{name=$Name;status='PASS'})}
function Reply($Result){return @{status=200;body=@{jsonrpc='2.0';id='test';result=$Result}}}
Check 'optional isError may be absent' (Ds-ToolSucceeded (Reply @{content=@(@{type='text';text='ok'})}))
Check 'explicit false is accepted' (Ds-ToolSucceeded (Reply @{content=@();isError=$false}))
Check 'true is rejected' (-not(Ds-ToolSucceeded (Reply @{content=@();isError=$true})))
Check 'malformed isError is rejected' (-not(Ds-ToolSucceeded (Reply @{content=@();isError='false'})))
Check 'HTTP success containing an RPC error is rejected' (-not(Ds-ToolSucceeded @{status=200;body=@{error=@{code=-32601}}}))
Check 'missing result is rejected' (-not(Ds-ToolSucceeded @{status=200;body=@{}}))
Check 'missing content is rejected' (-not(Ds-ToolSucceeded (Reply @{})))
Check 'HTTP failure is rejected' (-not(Ds-ToolSucceeded @{status=401;body=@{}}))
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('DeskSom-helper-test-'+[Guid]::NewGuid().ToString('N'))
$private=Join-Path $fixture 'private';$work=Join-Path $fixture 'work'
[void][IO.Directory]::CreateDirectory($private);[void][IO.Directory]::CreateDirectory($work)
$script:Expected=@{ready=$true;host='SYNTHETIC-HOST';version='test';instance='test';installationId='synthetic';sourceFingerprint='test';activeCalls=0}
$state=@{installationId='synthetic';plan=@{stateRoot=$private;allowedDirectories=@($work);version='test';instance='test';sourceFingerprint='test';binding=@{host='SYNTHETIC-HOST'}}}
function Ds-Probe($State){return $script:Expected}
function Ds-Rpc($State,[string]$Method,$Parameters=@{},[switch]$NoAuth){
  if($NoAuth){return @{status=401;body=@{error=@{code=-1}}}}
  if($Method -eq 'server/discover'){return Reply @{resultType='complete';ttlMs=0;cacheScope='private'}}
  if($Method -eq 'tools/list'){return Reply @{tools=@(1..25|ForEach-Object {@{name='tool'+$_}})}}
  if($Parameters.name -eq 'write_file'){[IO.File]::WriteAllText($Parameters.arguments.path,$Parameters.arguments.content,[Text.UTF8Encoding]::new($false));return Reply @{content=@(@{type='text';text='written'})}}
  if($Parameters.name -eq 'read_file'){return Reply @{content=@(@{type='text';text=[IO.File]::ReadAllText($Parameters.arguments.path)})}}
  throw 'Unexpected synthetic tool request'
}
try{
  Ds-Protect $private;Ds-Protect $private
  $acl=Get-Acl -LiteralPath $private
  Check 'normal-user private DACL is protected and idempotent' $acl.AreAccessRulesProtected
  Check 'private DACL contains only two explicit principals' (@($acl.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier])).Count -eq 2)
  $verification=Ds-VerifyMcp $state $true
  Check 'full disposable verifier accepts successful replies without isError' $verification.passed
  Check 'local verifier does not claim ChatGPT connectivity' (-not $verification.chatGPTVerified)
  Check 'successful verifier removes only its disposable file' (@(Get-ChildItem $work -File).Count -eq 0)
  $receipts=@(Get-ChildItem $private -Filter 'verification-*.json' -File)
  Check 'successful verifier creates one passing receipt' ($receipts.Count -eq 1 -and (Ds-ReadJson $receipts[0].FullName).phase -eq 'PASS')
  $pending=Join-Path $private 'verification-unresolved.json'
  Ds-WriteJson $pending @{schemaVersion='desksom.verification/v1';phase='INTENT';nonce='synthetic'}
  $blocked=$false
  try{Ds-VerifyMcp $state $true|Out-Null}catch{$blocked=$_.Exception.Message.StartsWith('VERIFICATION_OUTCOME_UNCERTAIN|')}
  Check 'unresolved prior verification prevents a second mutation' $blocked
  Check 'blocked verifier created no new work file' (@(Get-ChildItem $work -File).Count -eq 0)
  Check 'read-only verification is still available with unresolved receipt' (Ds-VerifyMcp $state $false).passed
  @{schemaVersion='desksom.test/v1';suite='windows-helper';passCount=$checks.Count;failCount=0;checks=$checks.ToArray();syntheticResponses=$true;cloudCredentialsUsed=$false}|ConvertTo-Json -Depth 6 -Compress
}finally{
  # This directory was created by this test invocation, never supplied by a user.
  if(Test-Path -LiteralPath $fixture){Remove-Item -LiteralPath $fixture -Recurse -Force}
}
