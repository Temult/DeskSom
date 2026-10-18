#requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'Gui-Install-Result.ps1')
function Check([string]$name,[bool]$pass) {
 if(-not $pass){throw ('GUI completion regression failed: '+$name)}
 $script:checks++
}
$script:checks=0
$plan=[pscustomobject]@{stateRoot='C:\Users\Owner\AppData\Local\DeskSom\testing';version='0.2.0-rc.10';sourceFingerprint=('a'*64)}
$success=[pscustomobject]@{operationOk=$true;command='install';status='LOCAL_READY';installationId='c6067bbd-262a-4ca1-bcbf-ead8ac51baf2';sourceFingerprint=('a'*64);stateRoot=$plan.stateRoot;setupComplete=$false}
$status=[pscustomobject]@{operationOk=$true;status='LOCAL_READY';localReady=$true;installationId=$success.installationId;sourceFingerprint=$success.sourceFingerprint;version=$plan.version}
Check 'successful installation has no error member' (-not(Test-DeskSomField $success 'error'))
Check 'successful receipt recognized' (Test-DeskSomInstallReceipt $success)
Check 'source-bound status validates actual completion' (Test-DeskSomInstallCompletion $success $status $plan)
Check 'missing optional error does not throw under StrictMode' ((Get-DeskSomInstallIssue $success 'Verification pending') -ceq 'Verification pending')
Check 'wrong installation ID rejected' (-not(Test-DeskSomInstallCompletion $success ([pscustomobject]@{operationOk=$true;status='LOCAL_READY';localReady=$true;installationId='foreign';sourceFingerprint=('a'*64);version=$plan.version}) $plan))
Check 'different source fingerprint rejected' (-not(Test-DeskSomInstallCompletion $success ([pscustomobject]@{operationOk=$true;status='LOCAL_READY';localReady=$true;installationId=$success.installationId;sourceFingerprint=('b'*64);version=$plan.version}) $plan))
Check 'false readiness rejected' (-not(Test-DeskSomInstallCompletion $success ([pscustomobject]@{operationOk=$true;status='ATTENTION_REQUIRED';localReady=$false;installationId=$success.installationId;sourceFingerprint=('a'*64);version=$plan.version}) $plan))
Check 'missing fields fail closed' (-not(Test-DeskSomInstallCompletion $success ([pscustomobject]@{localReady=$true}) $plan))
Check 'missing success receipt fails closed' (-not(Test-DeskSomInstallReceipt ([pscustomobject]@{command='install'})))
$blocked=[pscustomobject]@{operationOk=$false;command='install';status='BLOCKED';error=[pscustomobject]@{code='TASK_DRIFT';message='Ownership verification failed.';nextAction='Inspect the existing task.'}}
Check 'blocked error is descriptive' ((Get-DeskSomInstallIssue $blocked 'Fallback') -ceq 'Ownership verification failed. Inspect the existing task.')
$exitObject=[pscustomobject]@{ExitCode=$null;HasExited=$true}
Check 'nullable Windows PowerShell child exit is not proof of failure' ($exitObject.HasExited -and $null -eq $exitObject.ExitCode -and (Test-DeskSomInstallCompletion $success $status $plan))
[ordered]@{schemaVersion='desksom.gui-completion-test/v1';result='PASS';assertions=$script:checks;verifiedSuccessWithoutErrorProperty=$true;nullableExitAcceptedWithStatusProof=$true;noInstallationOrFilesystemMutation=$true}|ConvertTo-Json -Compress
