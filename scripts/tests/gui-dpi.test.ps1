#requires -Version 5.1
# Native no-window DPI smoke test. Never starts an installed service or changes user display settings.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'WinForms-Dpi.ps1')
$scale=Enable-DeskSomHighDpi
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$process=[Diagnostics.Process]::GetCurrentProcess()
try {
  [int]$awareness=-1
  $result=[DeskSom.DpiSupport]::GetProcessDpiAwareness($process.Handle,[ref]$awareness)
  if($result -ne 0 -or $awareness -eq 0){throw 'GUI host is still DPI-unaware.'}
  $form=New-Object Windows.Forms.Form
  try {
    $form.AutoScaleMode='None'
    $form.Font=New-Object Drawing.Font('Segoe UI',10)
    $form.Size=[Drawing.Size]::new(700,505)
    $label=New-Object Windows.Forms.Label
    $label.Text='Choose a folder ChatGPT can access'
    $label.Location=[Drawing.Point]::new(23,85)
    $label.Size=[Drawing.Size]::new(635,32)
    $form.Controls.Add($label)
    $before=$label.Width
    if($scale -ne 1.0){$form.Scale([Drawing.SizeF]::new($scale,$scale))}
    $after=$label.Width
    if($after -lt [Math]::Floor($before*$scale)-1){throw 'WinForms controls did not scale with display DPI.'}
    [ordered]@{schemaVersion='desksom.dpi-test/v1';result='PASS';processDpiAwareness=$awareness;systemDpi=[DeskSom.DpiSupport]::GetDpiForSystem();scale=$scale;labelWidthBefore=$before;labelWidthAfter=$after;dpiAwareWinForms=$true}|ConvertTo-Json -Compress
  } finally {$form.Dispose()}
} finally {$process.Dispose()}
