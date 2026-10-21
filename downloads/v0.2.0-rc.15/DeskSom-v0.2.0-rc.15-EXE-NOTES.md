# DeskSom rc.15 Windows installer EXE

**New-user installer:** [DeskSom-Setup-v0.2.0-rc.15.exe](https://github.com/Temult/DeskSom/releases/download/v0.2.0-rc.15/DeskSom-Setup-v0.2.0-rc.15.exe)

This is an optional single-file launcher for the **same qualified DeskSom 0.2.0-rc.15 source** already distributed in the portable ZIP. It does not replace the original ZIP or modify the release tag.

Double-click the EXE as your regular Windows user. It explains DeskSom's Windows-user terminal permissions, verifies its embedded source, extracts the source to a persistent folder within your user profile, and opens the existing three-page Windows setup wizard. Choose which folder ChatGPT can access, review permissions, finish installation and connect your *own* private OpenAI Secure MCP Tunnel. You still need PowerShell 7.4+ and Node.js 22.12+; optional filename indexing requires Node 25+. Windows 10/11 with .NET Framework 4.8+ is recommended for the launcher.

**This EXE is unsigned.** Windows may show an unknown-publisher or SmartScreen warning. Check the SHA-256 checksum before running it and install only if you trust this project. No installer can guarantee account eligibility for secure tunnels or eliminate possible service charges.

**Not an upgrade:** If DeskSom is already installed, don't use this EXE to overwrite its runtime. Follow an instance-bound upgrade process that preserves rollback. The EXE contains no credentials, private keys or other users' files. Its terminal tools have your Windows account's full permissions, not just the folders you select for direct file tools.

Validation: embedded payload checksum, all 161 manifest-listed files, fresh extraction, overwrite refusal, and noninteractive first-run wizard startup passed on the maintainer's Windows x64 machine. **A second user's actual account connection and installation have not yet been tested.** See the accompanying qualification JSON and checksum file.

Detailed setup: [INSTALLATION.md](https://github.com/Temult/DeskSom/blob/main/INSTALLATION.md).
