#requires -Version 7.4
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'WindowsHost.ps1') -Action Library
$script:toolNames=@()
function Reply($Value){return @{status=200;body=@{result=$Value}}}
function Ds-Probe($State){return @{ready=$true;host='SYNTHETIC';version='0.2.0-rc.13';instance='qa';installationId='qa';sourceFingerprint='qa';activeCalls=0}}
function Ds-Rpc($State,[string]$Method,$Parameters=@{},[switch]$NoAuth){
 if($NoAuth){return @{status=401;body=@{error=@{code=-1}}}}
 if($Method -eq 'server/discover'){return Reply @{resultType='complete';ttlMs=0;cacheScope='private'}}
 if($Method -eq 'tools/list'){return Reply @{tools=@($script:toolNames|ForEach-Object {@{name=$_;annotations=@{readOnlyHint=$true}}})}}
 throw 'UNEXPECTED_CALL'
}
$base=@('desksom_status','get_config','read_file','read_multiple_files','write_file','write_pdf',
'create_directory','list_directory','move_file','start_search','get_more_search_results','stop_search',
'list_searches','get_file_info','edit_block','start_process','read_process_output','interact_with_process',
'force_terminate','list_sessions','list_processes','kill_process','get_usage_stats','get_recent_tool_calls','get_prompts')
function Verify([bool]$Indexed,[bool]$Inspection,[string[]]$Names,[bool]$Accepted,[string]$Label){
 $s=@{plan=@{stateRoot='C:\FIXTURE';instance='qa';version='0.2.0-rc.13';sourceFingerprint='qa';binding=@{host='SYNTHETIC'}};installationId='qa';indexProfile=@{enabled=$Indexed};projectInspectEnabled=$Inspection}
 $script:toolNames=@($Names)
 $ok=$false
 try{$ok=(Ds-VerifyMcp $s $false).passed}catch{}
 if($ok -ne $Accepted){throw ('FAIL '+$Label)}
 Write-Output ('PASS '+$Label)
}
Verify $false $false $base $true 'baseline_25'
Verify $true $false (@($base)+@('find_files_fast')) $true 'index_only_26'
Verify $false $true (@($base)+@('inspect_project')) $true 'inspect_only_26'
Verify $true $true (@($base)+@('find_files_fast','inspect_project')) $true 'combined_27'
Verify $false $false (@($base)+@('inspect_project')) $false 'disabled_inspection_rejected'
Verify $false $true (@($base)+@('find_files_fast')) $false 'foreign_optional_tool_rejected'
Verify $true $true (@($base)+@('find_files_fast','find_files_fast')) $false 'duplicate_optional_rejected'
Verify $true $true (@($base[0..23])+@('foreign_tool','find_files_fast','inspect_project')) $false 'substituted_baseline_rejected'
Verify $false $false (@($base[0..23])+@($base[0])) $false 'duplicate_baseline_rejected'
Write-Output 'UNIFIED_NATIVE_CATALOG_PASS 9/9. No installed services touched.'
