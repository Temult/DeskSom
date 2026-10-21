#requires -Version 7.4
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'WindowsHost.ps1') -Action Library
$script:reply=@{ready=$true;host='FIXTURE';version='0.2.0-rc.14';instance='fixture';installationId='fixture-id';
 sourceFingerprint='fixture-hash';bootId='11111111-1111-4111-8111-111111111111';activeCalls=0;
 readinessContract='CORE_SERVICE_WITH_OPTIONAL_FEATURE_HEALTH_V1';indexWorkerReady=$false;allFeaturesReady=$false;
 indexStatus=@{enabled=$true;ready=$false;roots=@(@{root='C:\Fixture';state='FAILED';errorCode='ERR_SQLITE_ERROR';ready=$false})};
 unknownSensitiveValue='synthetic-do-not-copy'}
$script:unauthorized=$false
function Ds-Rpc($State,[string]$Method,$Parameters=@{}){
 if($script:unauthorized){return @{status=401;body=@{error=@{code=-1}}}}
 return @{status=200;body=@{result=@{structuredContent=$script:reply}}}
}
$count=0
function Assert-True([bool]$Value,[string]$Label){if(-not $Value){throw $Label};$script:count++}
$observed=Ds-Probe @{}
Assert-True ($observed.ready -eq $true) 'Optional index failure changed core ready'
Assert-True ($observed.indexWorkerReady -eq $false) 'Optional health was dropped'
Assert-True ($observed.allFeaturesReady -eq $false) 'Aggregate feature health was dropped'
Assert-True ($observed.indexStatus.roots[0].errorCode -eq 'ERR_SQLITE_ERROR') 'Root diagnostics did not reach owner status'
Assert-True (-not $observed.ContainsKey('unknownSensitiveValue')) 'Probe copied an unapproved field'
$state=@{installationId='fixture-id';plan=@{binding=@{host='FIXTURE'};version='0.2.0-rc.14';sourceFingerprint='fixture-hash';instance='fixture'}}
Assert-True (Ds-Identity $observed $state) 'Verified core identity must not require a ready optional index'
$observed.sourceFingerprint='foreign'
Assert-True (-not (Ds-Identity $observed $state)) 'Core identity validation was weakened'
$script:unauthorized=$true
$denied=Ds-Probe @{}
Assert-True ($denied.ready -eq $false) 'Unauthenticated status accepted'
Assert-True (-not $denied.ContainsKey('indexStatus')) 'Unverified optional details returned'
@{result='INDEX_STATUS_PROBE_PASS';assertions=$count;syntheticOnly=$true}|ConvertTo-Json -Compress
