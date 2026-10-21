#requires -Version 7.4
<#
 Build the Windows desktop EXE from the exact, tagged rc.15 portable source ZIP.
 The binary includes no dependency tree, credentials, or personal runtime state.
 Never use this to overwrite an installed DeskSom instance.
#>
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$PortableZip,
 [Parameter(Mandatory)][string]$OutputExe
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$expected='efde6022692f7ae593236ee286bac2fe3b864e5bb611379449e27a89250476a0'
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
$code=Join-Path $PSScriptRoot 'DeskSomSetup.cs'
if(-not(Test-Path -LiteralPath $compiler -PathType Leaf)){throw 'Windows .NET Framework C# compiler not found'}
if(-not(Test-Path -LiteralPath $code -PathType Leaf)){throw 'Maintainer installer source missing'}
if(Test-Path -LiteralPath $OutputExe){throw 'Refusing to overwrite an existing EXE'}
if((Get-FileHash -LiteralPath $PortableZip -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expected){throw 'Portable release hash mismatch'}
$path=[IO.Path]::GetFullPath($OutputExe)
$arguments=@('/nologo','/target:winexe','/platform:x64','/optimize+','/debug-',('/out:'+$path),
 ('/resource:'+[IO.Path]::GetFullPath($PortableZip)+',DeskSom.Payload.zip'),
 '/reference:System.Core.dll','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll',
 '/reference:System.IO.Compression.dll','/reference:System.IO.Compression.FileSystem.dll',
 '/reference:System.Web.Extensions.dll',$code)
& $compiler @arguments
if($LASTEXITCODE){throw 'Installer compilation failed'}
[pscustomobject]@{status='EXE_COMPILED';sourceZipSha256=$expected;exeSha256=(Get-FileHash $path -Algorithm SHA256).Hash.ToLowerInvariant();size=(Get-Item $path).Length;signature=(Get-AuthenticodeSignature $path).Status.ToString()}|ConvertTo-Json -Compress
