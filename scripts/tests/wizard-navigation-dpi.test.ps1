#requires -Version 5.1
# Native GUI navigation regression. Read-only and no window by contract.
# Verify dynamic Back-button positions after WinForms DPI scaling. Merely checking
# screen bounds previously missed a button floating over the page body.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$wizard=Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'Start-DeskSom-GUI.ps1'
if(-not(Test-Path -LiteralPath $wizard -PathType Leaf)){throw 'Wizard source missing'}
$raw=& powershell.exe -NoProfile -NonInteractive -STA -File $wizard -LayoutCheck -PreviewOnly
if($LASTEXITCODE -ne 0){throw ('Wizard layout execution failed: '+($raw -join ' '))}
$result=($raw -join [Environment]::NewLine)|ConvertFrom-Json
if($result.pageCount -ne 3 -or $result.navigationCollisionCount -ne 0 -or
   $result.offscreenControls -ne 0 -or $result.offscreenPageControls -ne 0){
 throw ('Wizard layout or navigation overlap: '+($result|ConvertTo-Json -Compress -Depth 5))
}
$scale=[double]$result.uiScale
if($scale -le 0){throw 'Invalid DPI scale'}
foreach($page in @($result.pages)){
 $x=if($page.number -eq 3){383}else{265}
 $wantX=[int][math]::Round($x*$scale)
 $wantY=[int][math]::Round(347*$scale)
 if($page.backButtonX -ne $wantX -or $page.backButtonY -ne $wantY -or
    $page.backButtonInFooter -ne $true){
  throw ('Back button wrong after navigation at step '+$page.number)
 }
}
[pscustomobject]@{schema='desksom.wizard-back-dpi/v1';status='PASS';uiScale=$scale;
 pageCount=3;navigationCollisionCount=0;backPositionsVerified=3;
 noServiceCommands=$true;actualOwnerVisualApproval=$false}|ConvertTo-Json -Compress
