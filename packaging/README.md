# Building the DeskSom Windows setup EXE

This directory contains the source of the small **unsigned** Windows launcher offered alongside the portable rc.15 ZIP. It does not contain Desktop Commander's dependency tree, your private DeskSom runtime, or any user's tunnel keys.

The EXE embeds the byte-for-byte qualified `v0.2.0-rc.15` portable source archive and verifies its SHA-256 and manifest before extracting to a new, persistent folder under the installing user's local profile. It then opens the same `Start-DeskSom-GUI.ps1` wizard provided in the ZIP.

To reproduce a build on Windows x64 with the .NET Framework C# compiler:

```powershell
pwsh.exe -NoProfile -File .\packaging\Build-DeskSomSetup.ps1 `
  -PortableZip .\downloads\v0.2.0-rc.15\DeskSom-v0.2.0-rc.15-portable.zip `
  -OutputExe .\DeskSom-Setup-local.exe
```

The script refuses an already-existing output, checks the embedded ZIP's exact qualified SHA-256, and compiles from `DeskSomSetup.cs`. Build dates and compiler versions can change the EXE's byte hash; consult the release checksum for the reviewed downloadable binary.

You can test the launcher without installing DeskSom. The compiled EXE accepts `--verify --receipt <new-report-path>` and `--extract-test <new-empty-destination> --receipt <new-report-path>`. Those modes do not start the setup wizard or register any Windows service. The normal double-click path shows an explicit permissions explanation before extraction.

The launcher needs the .NET Framework ZIP APIs available in Windows 10/11. DeskSom itself requires PowerShell 7.4+ and Node.js 22.12+; optional filename indexing needs Node 25+. **The launcher is not an in-place updater**. Existing installations must use the reviewed instance-bound upgrade mechanism.

The binary is not Authenticode signed. Do not describe the embedded SHA-256 as a publisher signature. A second-computer/new-account installation and its private tunnel association remain a separate acceptance milestone.
