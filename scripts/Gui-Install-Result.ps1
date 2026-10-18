#requires -Version 5.1
# Pure owner-GUI completion validation. No install, repair, restart or blind replay.
Set-StrictMode -Version Latest
function Test-DeskSomField([object]$Object,[string]$Name) {
  if ($null -eq $Object) { return $false }
  return ($null -ne $Object.PSObject.Properties[$Name])
}
function Test-DeskSomInstallReceipt([object]$Receipt) {
  if (-not (Test-DeskSomField $Receipt 'operationOk') -or
      -not (Test-DeskSomField $Receipt 'command') -or
      -not (Test-DeskSomField $Receipt 'status') -or
      -not (Test-DeskSomField $Receipt 'installationId') -or
      -not (Test-DeskSomField $Receipt 'sourceFingerprint') -or
      -not (Test-DeskSomField $Receipt 'stateRoot')) { return $false }
  return ($Receipt.operationOk -eq $true -and $Receipt.command -ceq 'install' -and
    $Receipt.status -ceq 'LOCAL_READY' -and -not [string]::IsNullOrWhiteSpace([string]$Receipt.installationId) -and
    -not [string]::IsNullOrWhiteSpace([string]$Receipt.sourceFingerprint))
}
function Test-DeskSomInstallCompletion([object]$Receipt,[object]$Status,[object]$Plan) {
  if (-not (Test-DeskSomInstallReceipt $Receipt)) { return $false }
  foreach($name in @('operationOk','localReady','status','installationId','sourceFingerprint','version')){
    if (-not (Test-DeskSomField $Status $name)) { return $false }
  }
  foreach($name in @('stateRoot','sourceFingerprint','version')){
    if (-not (Test-DeskSomField $Plan $name)) { return $false }
  }
  return ($Status.operationOk -eq $true -and $Status.localReady -eq $true -and
    $Status.status -ceq 'LOCAL_READY' -and
    $Status.installationId -ceq $Receipt.installationId -and
    $Status.sourceFingerprint -ceq $Receipt.sourceFingerprint -and
    $Status.sourceFingerprint -ceq $Plan.sourceFingerprint -and
    $Status.version -ceq $Plan.version -and
    [string]::Equals([string]$Receipt.stateRoot,[string]$Plan.stateRoot,
      [StringComparison]::OrdinalIgnoreCase))
}
function Get-DeskSomInstallIssue([object]$Receipt,[string]$Fallback) {
  if (Test-DeskSomField $Receipt 'error') {
    $problem=$Receipt.error
    if (Test-DeskSomField $problem 'message') {
      $message=[string]$problem.message
      if (-not [string]::IsNullOrWhiteSpace($message)) {
        if (Test-DeskSomField $problem 'nextAction') {
          $next=[string]$problem.nextAction
          if(-not [string]::IsNullOrWhiteSpace($next)){return ($message+' '+$next)}
        }
        return $message
      }
    }
  }
  return $Fallback
}
