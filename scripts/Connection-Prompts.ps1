#requires -Version 7.4
# Owner-only local WinForms prompts; caller never passes a secret as a command argument.
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Ds-TunnelIdPrompt {
 $form=New-Object Windows.Forms.Form
 $form.Text='DeskSom | Connect your ChatGPT account'
 $form.Size=[Drawing.Size]::new(615,295)
 $form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false
 $form.StartPosition='CenterScreen';$form.Font=New-Object Drawing.Font('Segoe UI',10)
 $label=New-Object Windows.Forms.Label
 $label.Text='Create or select a private tunnel in OpenAI Platform. Paste its tunnel ID below. This belongs to your account, not the DeskSom developer.'
 $label.Location=[Drawing.Point]::new(22,20);$label.Size=[Drawing.Size]::new(550,65)
 $form.Controls.Add($label)
 $entry=New-Object Windows.Forms.TextBox
 $entry.Location=[Drawing.Point]::new(22,103);$entry.Size=[Drawing.Size]::new(552,28)
 $form.Controls.Add($entry)
 $open=New-Object Windows.Forms.Button
 $open.Text='Open tunnel settings';$open.Location=[Drawing.Point]::new(22,155)
 $open.Size=[Drawing.Size]::new(215,36)
 $open.Add_Click({Start-Process 'https://platform.openai.com/settings/organization/tunnels'|Out-Null})
 $form.Controls.Add($open)
 $ok=New-Object Windows.Forms.Button
 $ok.Text='Continue';$ok.Location=[Drawing.Point]::new(343,155);$ok.Size=[Drawing.Size]::new(105,36)
 $cancel=New-Object Windows.Forms.Button
 $cancel.Text='Cancel';$cancel.Location=[Drawing.Point]::new(462,155);$cancel.Size=[Drawing.Size]::new(105,36)
 $cancel.DialogResult=[Windows.Forms.DialogResult]::Cancel
 $ok.Add_Click({
  if($entry.Text.Trim() -cnotmatch '^tunnel_[A-Za-z0-9_]{16,80}$'){
   [void][Windows.Forms.MessageBox]::Show($form,'The tunnel ID format is not recognized. Copy the actual tunnel ID from OpenAI Platform.','DeskSom')
   return
  }
  $form.DialogResult=[Windows.Forms.DialogResult]::OK;$form.Close()
 })
 $form.Controls.Add($ok);$form.Controls.Add($cancel);$form.CancelButton=$cancel
 try{
  if($form.ShowDialog() -ne [Windows.Forms.DialogResult]::OK){throw 'Owner cancelled tunnel setup; no new association was saved.'}
  return $entry.Text.Trim()
 }finally{$form.Dispose()}
}

function Ds-RestrictedKeyPrompt {
 $form=New-Object Windows.Forms.Form
 $form.Text='DeskSom | Restricted tunnel runtime key'
 $form.Size=[Drawing.Size]::new(615,310)
 $form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false
 $form.StartPosition='CenterScreen';$form.Font=New-Object Drawing.Font('Segoe UI',10)
 $label=New-Object Windows.Forms.Label
 $label.Text='Create a restricted OpenAI Platform key with Tunnels Read + Use. Enter it locally below. It will be encrypted for your Windows login. Never paste it into ChatGPT.'
 $label.Location=[Drawing.Point]::new(22,19);$label.Size=[Drawing.Size]::new(555,77)
 $form.Controls.Add($label)
 $entry=New-Object Windows.Forms.TextBox
 $entry.Location=[Drawing.Point]::new(22,110);$entry.Size=[Drawing.Size]::new(548,29)
 $entry.UseSystemPasswordChar=$true
 $form.Controls.Add($entry)
 $link=New-Object Windows.Forms.Button
 $link.Text='Open API key settings';$link.Location=[Drawing.Point]::new(22,162)
 $link.Size=[Drawing.Size]::new(216,35)
 $link.Add_Click({Start-Process 'https://platform.openai.com/settings/organization/api-keys'|Out-Null})
 $form.Controls.Add($link)
 $ok=New-Object Windows.Forms.Button
 $ok.Text='Save restricted key';$ok.Location=[Drawing.Point]::new(329,162);$ok.Size=[Drawing.Size]::new(148,35)
 $cancel=New-Object Windows.Forms.Button
 $cancel.Text='Cancel';$cancel.Location=[Drawing.Point]::new(487,162);$cancel.Size=[Drawing.Size]::new(85,35)
 $cancel.DialogResult=[Windows.Forms.DialogResult]::Cancel
 $ok.Add_Click({
  if($entry.Text.Length -lt 20 -or $entry.Text.Length -gt 2048){
   [void][Windows.Forms.MessageBox]::Show($form,'Enter a real restricted runtime API key from your own OpenAI account.','DeskSom')
   return
  }
  $form.DialogResult=[Windows.Forms.DialogResult]::OK;$form.Close()
 })
 $form.Controls.Add($ok);$form.Controls.Add($cancel);$form.CancelButton=$cancel
 try{
  if($form.ShowDialog() -ne [Windows.Forms.DialogResult]::OK){throw 'Owner cancelled restricted-key entry.'}
  $secret=ConvertTo-SecureString $entry.Text -AsPlainText -Force
  $entry.Clear()
  return $secret
 }finally{$entry.Clear();$form.Dispose()}
}
function Ds-ConfirmTunnelContext {
 $message='This private tunnel must be associated with your Platform organization and ChatGPT workspace. Terminal access uses your full Windows-user permissions, not just file-tool folders.'+
  [Environment]::NewLine+[Environment]::NewLine+
  'Continue with the account connection?'
 return ([Windows.Forms.MessageBox]::Show($message,'DeskSom connection permission',
  [Windows.Forms.MessageBoxButtons]::YesNo,[Windows.Forms.MessageBoxIcon]::Warning) -eq [Windows.Forms.DialogResult]::Yes)
}
