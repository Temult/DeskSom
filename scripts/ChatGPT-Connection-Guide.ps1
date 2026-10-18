#requires -Version 5.1
# Owner-facing final account steps; read-only local inspection, never creates a plugin.
[CmdletBinding()]
param([string]$StateRoot,[switch]$PreviewOnly,[switch]$LayoutCheck,[switch]$StateCheck)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($StateCheck -and ($PreviewOnly -or $LayoutCheck)){throw 'Choose either read-only state check or visual preview.'}
. (Join-Path $PSScriptRoot 'WinForms-Dpi.ps1')
$script:uiScale=Enable-DeskSomHighDpi
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()

if($PreviewOnly -or $LayoutCheck){
 $instance='sample-pc';$version='0.2.0-preview'
 $installationId='00000000-0000-4000-8000-000000000000'
 $tunnelId=$null
}else{
 if([string]::IsNullOrWhiteSpace($StateRoot)){throw 'Choose your installed DeskSom instance first.'}
 $statePath=Join-Path $StateRoot 'install.json'
 $associationPath=Join-Path $StateRoot 'connection.json'
 if(-not(Test-Path -LiteralPath $statePath -PathType Leaf) -or
    -not(Test-Path -LiteralPath $associationPath -PathType Leaf)){
   throw 'The local DeskSom connection is not yet configured. Use Connect ChatGPT in setup first.'
 }
 $state=Get-Content -LiteralPath $statePath -Raw -Encoding UTF8|ConvertFrom-Json
 $association=Get-Content -LiteralPath $associationPath -Raw -Encoding UTF8|ConvertFrom-Json
 $userSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 if($state.plan.binding.host -cne [Environment]::MachineName -or
    $state.plan.binding.sid -cne $userSid -or
    $association.installationId -cne $state.installationId -or
    $association.sourceFingerprint -cne $state.plan.sourceFingerprint -or
    $association.status -cne 'CONFIGURED' -or
    $state.credentialsConfigured -ne $true){
   throw 'DeskSom connection identity or account setup does not match. No change was made.'
 }
 $tunnelId=[string]$association.tunnelId
 if($tunnelId -cnotmatch '^tunnel_[A-Za-z0-9_]{16,80}$'){
   throw 'The stored tunnel identifier is invalid. Do not proceed until the local setup is checked.'
 }
 $instance=[string]$state.plan.instance
 $version=[string]$state.plan.version
 $installationId=[string]$state.installationId
}
$verifyMessage='Call desksom_status using only my new DeskSom connection. '+
 'Confirm version '+$version+', instance '+$instance+
 ', and installation ID '+$installationId+
 '. Do not change any files. If the new connection is unavailable, say so rather than using another DeskSom.'

if($StateCheck){
 [ordered]@{
  schemaVersion='desksom.connection-guide-state/v1'
  result='PASS';version=$version;instance=$instance;installationId=$installationId
  tunnelAssociationVerified=($null -ne $tunnelId)
  privateKeyRead=$false;pluginCreated=$false;chatGPTVerified=$false
 } | ConvertTo-Json -Compress
 return
}
$form=New-Object Windows.Forms.Form
$form.AutoScaleMode='None'
$form.Text=if($PreviewOnly){'DeskSom | ChatGPT connection preview'}else{'DeskSom | Finish ChatGPT connection'}
$form.ClientSize=[Drawing.Size]::new(720,505)
$form.FormBorderStyle='FixedDialog'
$form.MaximizeBox=$false
$form.StartPosition='CenterScreen'
$form.Font=New-Object Drawing.Font('Segoe UI',9)
$form.BackColor=[Drawing.Color]::White
function Add-Text([string]$value,[int]$x,[int]$y,[int]$width,[int]$height,[int]$font=9,[bool]$bold=$false){
 $l=New-Object Windows.Forms.Label
 $l.Text=$value;$l.Location=[Drawing.Point]::new($x,$y);$l.Size=[Drawing.Size]::new($width,$height)
 $weight=if($bold){[Drawing.FontStyle]::Bold}else{[Drawing.FontStyle]::Regular}
 $l.Font=New-Object Drawing.Font('Segoe UI',$font,$weight)
 $form.Controls.Add($l);return $l
}
function Add-Action([string]$label,[int]$x,[int]$y,[int]$w){
 $button=New-Object Windows.Forms.Button
 $button.Text=$label;$button.Location=[Drawing.Point]::new($x,$y)
 $button.Size=[Drawing.Size]::new($w,34)
 $form.Controls.Add($button);return $button
}
[void](Add-Text 'Finish connecting DeskSom to ChatGPT' 24 14 655 37 14 $true)
[void](Add-Text 'The Windows service is installed. Your ChatGPT account must finish the connection.' 24 55 667 38 9)
$steps=@(
 '1. Open ChatGPT Plugins and choose Add > Add custom MCP server.',
 ('2. Name it "DeskSom '+$instance+'". Under Connection, choose Tunnel.'),
 '3. Select your DeskSom tunnel, or paste its ID using Copy tunnel ID below.',
 '4. Choose No authentication for the ChatGPT-facing connection.',
 '5. Review the warning and select Create as a plugin. Install the new plugin.',
 '6. In a new ChatGPT chat, select that plugin and use Copy verification message.'
)
$guide=New-Object Windows.Forms.GroupBox
$guide.Text='Your remaining steps'
$guide.Location=[Drawing.Point]::new(24,102)
$guide.Size=[Drawing.Size]::new(672,252)
$form.Controls.Add($guide)
for($i=0;$i -lt $steps.Count;$i++){
 $line=New-Object Windows.Forms.Label
 $line.Text=$steps[$i]
 $line.Location=[Drawing.Point]::new(15,(26+$i*34))
 $line.Size=[Drawing.Size]::new(644,31)
 $line.Font=New-Object Drawing.Font('Segoe UI',9)
 $guide.Controls.Add($line)
}
$open=Add-Action 'Open ChatGPT Plugins' 24 370 205
$copyId=Add-Action 'Copy tunnel ID' 241 370 172
$copyPrompt=Add-Action 'Copy verification message' 425 370 271
[void](Add-Text 'Keep your API key private. Folder limits do not restrict Windows terminal commands.' 24 419 672 31 9)
[void](Add-Text 'Only a real ChatGPT tool call proves the connection works.' 24 447 545 30 9)
$close=Add-Action 'Close' 586 457 110
$open.Add_Click({Start-Process 'https://chatgpt.com/plugins'|Out-Null})
$copyId.Add_Click({
 if(-not $tunnelId){return}
 [Windows.Forms.Clipboard]::SetText($tunnelId)
 [void][Windows.Forms.MessageBox]::Show($form,'Tunnel ID copied. Paste it only into the ChatGPT tunnel selection field.','DeskSom')
})
$copyPrompt.Add_Click({
 [Windows.Forms.Clipboard]::SetText($verifyMessage)
 [void][Windows.Forms.MessageBox]::Show($form,'Verification message copied. Select the newly created plugin before sending it.','DeskSom')
})
$close.Add_Click({$form.Close()})
if($PreviewOnly -or $LayoutCheck){
 $open.Enabled=$false;$copyId.Enabled=$false;$copyPrompt.Enabled=$false
}
if($script:uiScale -ne 1.0){$form.Scale([Drawing.SizeF]::new($script:uiScale,$script:uiScale))}
if($LayoutCheck){
 $bad=@()
 foreach($control in $form.Controls){
  if($control.Left -lt 0 -or $control.Top -lt 0 -or
     $control.Right -gt $form.ClientSize.Width -or
     $control.Bottom -gt $form.ClientSize.Height){
    $bad+=$control.Text
  }
 }
 foreach($child in $guide.Controls){
  if($child.Left -lt 0 -or $child.Top -lt 0 -or
     $child.Right -gt $guide.ClientSize.Width -or
     $child.Bottom -gt $guide.ClientSize.Height){$bad+=('guide:'+ $child.Text)}
 }
 $screen=[Windows.Forms.Screen]::PrimaryScreen.WorkingArea
 $result=[ordered]@{
  schemaVersion='desksom.connection-guide-layout/v1';result=if($bad.Count){'FAIL'}else{'PASS'}
  pages=1;steps=$steps.Count;scale=$script:uiScale
  width=$form.Width;height=$form.Height;screenWidth=$screen.Width;screenHeight=$screen.Height
  clipped=$bad;requiresNoAccountSecrets=$true;createdNoPlugin=$true
 }
 $result|ConvertTo-Json -Compress -Depth 4
 if($bad.Count -or $form.Width -gt $screen.Width -or $form.Height -gt $screen.Height){
  throw 'Connection guide layout does not fit the display.'
 }
}else{
 [void]$form.ShowDialog()
}
$form.Dispose()