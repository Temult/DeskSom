#requires -Version 5.1
# Responsive owner-initiated CLI operations. Never retry or kill an uncertain command.
Set-StrictMode -Version Latest
function ConvertTo-DeskSomNativeArgument([AllowEmptyString()][string]$Value) {
 if($null -eq $Value){$Value=''}
 if($Value.Contains([char]0)){throw 'A native argument cannot contain NUL.'}
 $escaped=[regex]::Replace($Value,'(\\*)"','${1}${1}\"')
 $escaped=[regex]::Replace($escaped,'(\\+)$','${1}${1}')
 return '"'+$escaped+'"'
}
function Start-DeskSomUiCommand([string]$Executable,[string[]]$Arguments) {
 if(-not [IO.Path]::IsPathRooted($Executable) -or -not [IO.File]::Exists($Executable)){
  throw 'The installed command executable must be an existing absolute path.'
 }
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName=$Executable
 $info.Arguments=(@($Arguments|ForEach-Object {ConvertTo-DeskSomNativeArgument $_}) -join ' ')
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true
 $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true;$info.RedirectStandardInput=$true
 $info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
 $info.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)
 $process=New-Object Diagnostics.Process
 $process.StartInfo=$info
 if(-not $process.Start()){throw 'The owner command did not start.'}
 $process.StandardInput.Close()
 return [pscustomobject]@{Process=$process;Output=$process.StandardOutput.ReadToEndAsync();
  Error=$process.StandardError.ReadToEndAsync();Elapsed=[Diagnostics.Stopwatch]::StartNew();CompletedResult=$null}
}
function Read-DeskSomUiCommand($Command) {
 if($null -ne $Command.CompletedResult){return $Command.CompletedResult}
 $Command.Process.Refresh()
 if(-not $Command.Process.HasExited -or -not $Command.Output.IsCompleted -or -not $Command.Error.IsCompleted){
  return [pscustomobject]@{Done=$false}
 }
 # This Process object retains the original handle, unlike a detached Start-Process result.
 $Command.CompletedResult=[pscustomobject]@{Done=$true;ExitCode=[int]$Command.Process.ExitCode;
  Stdout=$Command.Output.GetAwaiter().GetResult();Stderr=$Command.Error.GetAwaiter().GetResult()}
 return $Command.CompletedResult
}
function Close-DeskSomUiCommand($Command) {
 if($null -eq $Command.CompletedResult){throw 'Cannot dispose an unresolved owner command.'}
 $Command.Elapsed.Stop();$Command.Process.Dispose()
}
function Show-DeskSomUiCommand([string]$Executable,[string[]]$Arguments,$Owner,[string]$Message,
 [int]$TimeoutMilliseconds=180000) {
 $command=Start-DeskSomUiCommand $Executable $Arguments
 $dialog=New-Object Windows.Forms.Form
 $dialog.Text='DeskSom | Applying owner request';$dialog.StartPosition='CenterParent'
 $dialog.ClientSize=[Drawing.Size]::new(540,160);$dialog.FormBorderStyle='FixedDialog'
 $dialog.ControlBox=$false;$dialog.Font=New-Object Drawing.Font('Segoe UI',9)
 $label=New-Object Windows.Forms.Label
 $label.Location=[Drawing.Point]::new(20,16);$label.Size=[Drawing.Size]::new(500,70);$label.Text=$Message
 $dialog.Controls.Add($label)
 $elapsed=New-Object Windows.Forms.Label
 $elapsed.Location=[Drawing.Point]::new(20,91);$elapsed.Size=[Drawing.Size]::new(500,25)
 $dialog.Controls.Add($elapsed)
 $progress=New-Object Windows.Forms.ProgressBar
 $progress.Location=[Drawing.Point]::new(20,122);$progress.Size=[Drawing.Size]::new(500,18);$progress.Style='Marquee'
 $dialog.Controls.Add($progress)
 $context=[pscustomobject]@{Done=$false;Result=$null;Failure=$null}
 $timer=New-Object Windows.Forms.Timer;$timer.Interval=200
 $timer.Add_Tick({
  try{
   $elapsed.Text=('Elapsed: '+[math]::Floor($command.Elapsed.Elapsed.TotalSeconds)+' seconds. Command started once; no retry.')
   $result=Read-DeskSomUiCommand $command
   if($result.Done){$context.Result=$result;$context.Done=$true;$timer.Stop();$dialog.Close()}
   elseif($command.Elapsed.ElapsedMilliseconds -ge $TimeoutMilliseconds){
    $context.Failure='Command outcome is not yet known (PID '+$command.Process.Id+'). Inspect the private operation receipt before retrying.'
    $context.Done=$true;$timer.Stop();$dialog.Close()
   }
  }catch{$context.Failure=$_.Exception.Message;$context.Done=$true;$timer.Stop();$dialog.Close()}
 })
 $dialog.Add_FormClosing({param($sender,$eventArgs);if(-not $context.Done){$eventArgs.Cancel=$true}})
 if(Get-Variable -Name uiScale -Scope Script -ErrorAction SilentlyContinue){
  if($script:uiScale -ne 1.0){$dialog.Scale([Drawing.SizeF]::new($script:uiScale,$script:uiScale))}
 }
 try{$timer.Start();[void]$dialog.ShowDialog($Owner)}finally{
  $timer.Stop();$timer.Dispose();$dialog.Dispose()
  if($null -ne $command.CompletedResult){Close-DeskSomUiCommand $command}
  else{
   # Preserve live handles/readers in this control-panel process. Disposing them
   # could break the child's pipes; neither termination nor replay is safe here.
   if(-not(Get-Variable -Name DeskSomUnresolvedUiCommands -Scope Script -ErrorAction SilentlyContinue)){
    $script:DeskSomUnresolvedUiCommands=New-Object Collections.ArrayList
   }
   [void]$script:DeskSomUnresolvedUiCommands.Add($command)
  }
 }
 if($context.Failure){throw $context.Failure}
 if($null -eq $context.Result){throw 'Command completion was not observed. Inspect its receipt; do not replay.'}
 return $context.Result
}
