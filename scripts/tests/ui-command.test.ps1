#requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'Ui-Command.ps1')
$node=(Get-Command node.exe -ErrorAction Stop).Source
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('desksom-ui-command-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($fixture)
$child=Join-Path $fixture 'fixture.mjs'
$code=@'
import fs from 'node:fs';
const [mode,counter,...args]=process.argv.slice(2);
fs.appendFileSync(counter,'1\n');
if(mode==='pipes')process.stderr.write('X'.repeat(262144));
process.stdout.write(JSON.stringify({args})+'\n');
process.exitCode=mode==='failure'?7:0;
'@
[IO.File]::WriteAllText($child,$code,[Text.UTF8Encoding]::new($false))
$count=0
function Assert-True([bool]$Value,[string]$Name){if(-not $Value){throw $Name};$script:count++}
function Finish-Command($Command){
 $deadline=[DateTime]::UtcNow.AddSeconds(15)
 do{
  $r=Read-DeskSomUiCommand $Command
  if($r.Done){return $r}
  Start-Sleep -Milliseconds 20
 }while([DateTime]::UtcNow -lt $deadline)
 throw 'The synthetic UI command did not finish; fixture retained.'
}
try{
 $counter=Join-Path $fixture 'executions.txt'
 $words=@('ordinary','space value','trailing\','quote"value','slash\"quote','a&b;$(not executed)','caf'+[char]0xE9,'')
 $command=Start-DeskSomUiCommand $node (@($child,'args',$counter)+$words)
 $result=Finish-Command $command
 Assert-True ($result.ExitCode -eq 0) 'Original process exit code was not retained'
 $decoded=$result.Stdout|ConvertFrom-Json
 Assert-True ($decoded.args.Count -eq $words.Count) 'Native quoting changed argument count'
 for($i=0;$i -lt $words.Count;$i++){Assert-True ($decoded.args[$i] -ceq $words[$i]) ('Argument roundtrip '+$i)}
 Assert-True ((Read-DeskSomUiCommand $command).Stdout -ceq $result.Stdout) 'Polling must return cached completion'
 Close-DeskSomUiCommand $command
 Assert-True (@([IO.File]::ReadAllLines($counter)).Count -eq 1) 'Polling replayed the command'
 $pipe=Start-DeskSomUiCommand $node @($child,'pipes',$counter)
 $r=Finish-Command $pipe
 Assert-True ($r.ExitCode -eq 0 -and $r.Stderr.Length -eq 262144) 'Concurrent stderr drain failed'
 Close-DeskSomUiCommand $pipe
 $failed=Start-DeskSomUiCommand $node @($child,'failure',$counter)
 $r=Finish-Command $failed
 Assert-True ($r.ExitCode -eq 7) 'Nonzero child result must not become success'
 Close-DeskSomUiCommand $failed
 Assert-True (@([IO.File]::ReadAllLines($counter)).Count -eq 3) 'A failed command was replayed'
 $nulRejected=$false
 try{ConvertTo-DeskSomNativeArgument ('bad'+[char]0+'argument')|Out-Null}catch{$nulRejected=$true}
 Assert-True $nulRejected 'NUL argument was accepted'
 [ordered]@{result='UI_COMMAND_NATIVE_PASS';assertions=$count;powerShell=$PSVersionTable.PSVersion.ToString();
  noWindowShown=$true;noServicesChanged=$true;noReplay=$true}|ConvertTo-Json -Compress
 Remove-Item -LiteralPath $fixture -Recurse -Force
}catch{Write-Output ('Preserved synthetic fixture: '+$fixture);throw}
