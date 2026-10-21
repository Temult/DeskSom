#requires -Version 7.4
# Native owner-stop admission tests; ALL task / HTTP operations are mocked.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'WindowsHost.ps1') -Action Library
$script:active=0;$script:replyStatus=200;$script:ackDrift=$false
$script:probes=0;$script:quiesces=0;$script:disables=0;$script:stops=0
$script:boot='11111111-1111-4111-8111-111111111111'
$script:probeOverride=@{};$script:omitField=$null;$script:fixtureReady=$true
$state=@{installationId='22222222-2222-4222-8222-222222222222';
 plan=@{port=19991;stateRoot='C:\NO_REAL_STATE';tasks=@{local='DeskSom-unit-Local';tunnel='DeskSom-unit-Tunnel'};
  binding=@{host='SYNTHETIC-HOST'};version='0.2.0-rc.14';instance='unit';sourceFingerprint='synthetic-source'};
 indexProfile=@{enabled=$false;indices=@()}}
function Ds-ExpectedTask($State,[string]$Kind){return @{name=if($Kind -eq 'local'){'DeskSom-unit-Local'}else{'DeskSom-unit-Tunnel'}}}
function Ds-TaskGet([string]$Name){return @{name=$Name;state='Running';enabled=$true}}
function Ds-AssertTask($Task,$Expected){}
function Ds-Processes($State,[string]$Kind){return @()}
function Ds-Probe($State){
 $script:probes++
 $v=@{ready=$script:fixtureReady;activeCalls=$script:active;bootId=$script:boot;
  host=$State.plan.binding.host;version=$State.plan.version;instance=$State.plan.instance;
  installationId=$State.installationId;sourceFingerprint=$State.plan.sourceFingerprint}
 foreach($key in $script:probeOverride.Keys){$v[$key]=$script:probeOverride[$key]}
 if($script:omitField){$v.Remove($script:omitField)}
 return $v
}
function Ds-Secret($Path){return 'synthetic-token-never-real'}
function Get-CimInstance {param($ClassName,$Filter);return @()}
function Disable-ScheduledTask {param([string]$TaskName);$script:disables++}
function Stop-ScheduledTask {param([string]$TaskName,$ErrorAction);$script:stops++}
function Invoke-WebRequest {
 [CmdletBinding()]param($Uri,$Method,$Headers,$ContentType,$Body,[switch]$SkipHttpErrorCheck,$TimeoutSec)
 $script:quiesces++
 $want=if($state.indexProfile.enabled){'INDEX_QUIESCED'}else{'BROKER_QUIESCED'}
 if($script:ackDrift){$want='FOREIGN_ACK'}
 return @{StatusCode=$script:replyStatus;Content=(@{status=$want;bootId=$script:boot;
   installationId=$state.installationId;indexEnabled=[bool]$state.indexProfile.enabled;
   writerLeaseReleased=[bool]$state.indexProfile.enabled}|ConvertTo-Json -Compress)}
}
function Check([string]$Label,[bool]$ShouldStop,[bool]$ExpectQuiesce){
 $a=$script:disables;$b=$script:stops;$q=$script:quiesces;$passed=$false
 try{Ds-StopService $state 'local'|Out-Null;$passed=$true}catch{}
 if($passed -ne $ShouldStop){throw ('FAILED_STATE_'+$Label)}
 if($ShouldStop){
  if($script:disables -ne ($a+1) -or $script:stops -ne ($b+1)){throw ('FAILED_STOP_'+$Label)}
 }elseif($script:disables -ne $a -or $script:stops -ne $b){throw ('UNSAFE_STOP_'+$Label)}
 if(($script:quiesces -gt $q) -ne $ExpectQuiesce){throw ('QUIESCE_COUNT_'+$Label)}
 Write-Output ('PASS '+$Label)
}
$script:active=1;Check 'disabled_active_call_blocks_stop' $false $false
$script:active=0;$script:replyStatus=409;Check 'disabled_quiesce_refusal_blocks_stop' $false $true
$script:replyStatus=200;$script:ackDrift=$true;Check 'disabled_foreign_ack_blocks_stop' $false $true
$script:ackDrift=$false;Check 'disabled_quiesce_precedes_stop' $true $true
$state.indexProfile.enabled=$true
$script:active=1;Check 'enabled_active_call_blocks_stop' $false $false
$script:active=0;Check 'enabled_quiesce_precedes_stop' $true $true
$script:fixtureReady=$false;Check 'stale_index_exact_owner_can_quiesce' $true $true
$script:fixtureReady=$true
foreach($field in @('host','version','instance','installationId','sourceFingerprint','bootId')){
 $script:probeOverride=@{};$script:probeOverride[$field]='FOREIGN'
 Check ('foreign_'+$field+'_blocks_before_quiesce') $false $false
}
$script:probeOverride=@{};$script:omitField='activeCalls'
Check 'missing_active_count_blocks_before_quiesce' $false $false
$script:omitField=$null
Write-Output 'STOP_ALL_LOCAL_NATIVE_PASS 14/14. No real service, credential, port or task touched.'
